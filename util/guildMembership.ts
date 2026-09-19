import { Guild } from "discord.js"

const UNKNOWN_MEMBER = 10007

const isGuildMember = async (guild: Guild | undefined, userId: string): Promise<boolean | undefined> => {
    if (guild === undefined) return undefined

    return await guild.members.fetch(userId).then(() => true).catch((err) => {
        if ((err as {code?: number}).code === UNKNOWN_MEMBER) return false

        console.log(err)
        return undefined
    })
}

export default isGuildMember
