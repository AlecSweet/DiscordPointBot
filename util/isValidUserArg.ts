import { Guild } from "discord.js"

const isValidUserArg = async (id: string, guild: Guild): Promise<boolean> => {
    try {
        if (await guild.members.fetch(id)) {
            return true
        }
    // eslint-disable-next-line no-empty
    } catch(e) {}
    return false
}

export default isValidUserArg