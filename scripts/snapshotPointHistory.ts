import * as dotenv from "dotenv"
import { writeFileSync } from "fs"
import { Client, Intents } from "discord.js"
import mongoose from "mongoose"
import pointHistoryBody from "../web/pointHistoryPayload"
dotenv.config()

const DEFAULT_OUT = "pointHistory.json"

const argv = process.argv.slice(2)

const option = (name: string): string | undefined => {
    const index = argv.indexOf(name)
    return index === -1 ? undefined : argv[index + 1]
}

const main = async () => {
    const token = process.env.TOKEN
    const mongoUri = process.env.MONGO_URI
    const guildId = process.env.GUILD_ID
    if (token === undefined || mongoUri === undefined || guildId === undefined) {
        console.log("TOKEN, MONGO_URI and GUILD_ID must be set")
        return
    }

    const outPath = option("--out") ?? DEFAULT_OUT

    await mongoose.connect(mongoUri)
    const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MEMBERS]})

    try {
        const ready = new Promise<Client>(resolve => client.once("ready", resolve))
        await client.login(token)
        await ready

        const guild = await client.guilds.fetch(guildId)
        const body = await pointHistoryBody(guild)
        writeFileSync(outPath, body)

        const payload = JSON.parse(body)
        const rows = payload.people.reduce((sum: number, person: {rows: unknown[]}) => sum + person.rows.length, 0)
        console.log(`wrote ${outPath}: ${rows} events across ${payload.people.length} people, ${(body.length / 1048576).toFixed(2)} MB`)
        console.log(`serve it with: npm run servePointHistory`)
    } finally {
        await mongoose.disconnect()
        client.destroy()
    }
}

if (require.main === module) {
    main().catch(err => { console.log(err); process.exit(1) })
}
