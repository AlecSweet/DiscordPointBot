import { Guild } from "discord.js"

const isValidUserArg = async (id: string, guild: Guild): Promise<boolean> => {
    try {
        const ids = guild.members.cache.map(member => {
            return member.user.id
        })
        if (ids.indexOf(id) > -1) {
            return true
        }
    // eslint-disable-next-line no-empty
    } catch(e) {}
    return false
}

export default isValidUserArg