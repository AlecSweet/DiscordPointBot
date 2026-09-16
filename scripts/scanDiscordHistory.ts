import { get } from "https"
import { Client, Collection, FetchedThreads, Message, NewsChannel, Snowflake, TextBasedChannel, TextChannel, ThreadChannel } from "discord.js"
import sleep from "../util/sleep"

export const SINCE = new Date("2022-02-20T00:00:00-06:00").getTime()

const PAGE_SIZE = 100
const PROGRESS_EVERY = 10000
const THREAD_PROGRESS_EVERY = 25
const RECORD_FILES = ["flips.txt", "martingale.txt"]

export interface IScanOptions {
    withAttachments: boolean
    delayMs: number
}

export interface IScanCounts {
    scanned: number
    found: number
    failed: string[]
}

export type MessageHandler = (message: Message<boolean>, record: string | undefined) => number

export type PlayerMessageHandler = (message: Message<boolean>) => number

const download = (url: string): Promise<string | undefined> => new Promise(resolve => {
    get(url, response => {
        if (response.statusCode !== 200) {
            response.resume()
            resolve(undefined)
            return
        }
        let body = ""
        response.setEncoding("utf8")
        response.on("data", chunk => { body += chunk })
        response.on("end", () => resolve(body))
    }).on("error", () => resolve(undefined))
})

const recordOf = async (message: Message<boolean>): Promise<string | undefined> => {
    const record = message.attachments.find(attachment => attachment.name !== null && RECORD_FILES.indexOf(attachment.name) !== -1)
    return record === undefined ? undefined : await download(record.url)
}

const oldest = (messages: Message<boolean>[]): Message<boolean> =>
    messages.reduce((found, message) => message.createdTimestamp < found.createdTimestamp ? message : found)

export const scanChannel = async (channel: TextBasedChannel, botId: string, options: IScanOptions, handle: MessageHandler,
    handlePlayer?: PlayerMessageHandler): Promise<IScanCounts> => {
    let before: Snowflake | undefined = undefined
    let scanned = 0
    let found = 0

    for (;;) {
        const batch: Collection<Snowflake, Message<boolean>> = await channel.messages.fetch({limit: PAGE_SIZE, before: before})
        if (batch.size === 0) {
            return {scanned: scanned, found: found, failed: []}
        }

        const messages = batch.map(message => message)
        const recent = messages.filter(message => message.createdTimestamp >= SINCE)
        for (const message of recent) {
            if (message.author.id !== botId) {
                if (handlePlayer) found += handlePlayer(message)
                continue
            }
            const record = options.withAttachments ? await recordOf(message) : undefined
            found += handle(message, record)
        }

        const previous = scanned
        scanned += recent.length
        if (Math.floor(scanned / PROGRESS_EVERY) > Math.floor(previous / PROGRESS_EVERY)) {
            console.log(`    ${scanned} scanned, ${found} found`)
        }

        if (recent.length < messages.length) {
            return {scanned: scanned, found: found, failed: []}
        }

        before = oldest(messages).id
        if (options.delayMs > 0) {
            await sleep(options.delayMs)
        }
    }
}

const threadsOf = async (channel: TextChannel | NewsChannel): Promise<ThreadChannel[]> => {
    const active: FetchedThreads = await channel.threads.fetchActive()
    const threads = active.threads.map(thread => thread)

    let before: number | undefined = undefined
    for (;;) {
        const page: FetchedThreads = await channel.threads.fetchArchived({type: "public", before: before, limit: PAGE_SIZE})
        const archived = page.threads.map(thread => thread)
        const recent = archived.filter(thread => (thread.archiveTimestamp ?? 0) >= SINCE)
        threads.push(...recent)

        if (!page.hasMore || archived.length === 0 || recent.length < archived.length) {
            return threads
        }
        before = Math.min(...archived.map(thread => thread.archiveTimestamp ?? 0))
    }
}

export const scanThreads = async (channel: TextChannel | NewsChannel, botId: string, options: IScanOptions, handle: MessageHandler,
    handlePlayer?: PlayerMessageHandler): Promise<IScanCounts> => {
    const failed: string[] = []
    const threads = await threadsOf(channel)
        .catch((err): ThreadChannel[] => { console.log(err); failed.push(`the thread list of #${channel.name}`); return [] })
    console.log(`\nscanning ${threads.length} threads`)

    let scanned = 0
    let found = 0
    let done = 0
    for (const thread of threads) {
        const counts = await scanChannel(thread, botId, options, handle, handlePlayer)
            .catch((err): IScanCounts => { console.log(`${thread.name}: ${err}`); failed.push(`thread ${thread.name}`); return {scanned: 0, found: 0, failed: []} })
        scanned += counts.scanned
        found += counts.found
        done++
        if (done % THREAD_PROGRESS_EVERY === 0) {
            console.log(`    ${done} of ${threads.length} threads, ${found} found`)
        }
    }

    return {scanned: scanned, found: found, failed: failed}
}

export const textChannel = async (client: Client, channelId: string): Promise<TextChannel | NewsChannel | undefined> => {
    const channel = await client.channels.fetch(channelId)
    if (channel === null || (channel.type !== "GUILD_TEXT" && channel.type !== "GUILD_NEWS")) {
        console.log(`${channelId} is not a text channel the bot can see`)
        return undefined
    }
    return channel
}
