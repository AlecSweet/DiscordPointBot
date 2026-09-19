import { Collection, Guild, GuildMember } from "discord.js"
import { allPointEvents, IPointEvent } from "../db/pointEvent"

export interface IMemberName {
    name: string
    username: string | null
    nickname: string | null
}

export type INamedPointEvent = Omit<IPointEvent, "userId"> & IMemberName

export const departedMember = (userId: string): IMemberName => ({name: userId, username: null, nickname: null})

const cachedEveryMember = (guild: Guild): boolean => guild.members.cache.size >= guild.memberCount

export const memberNames = async (guild: Guild): Promise<Map<string, IMemberName>> => {
    const members: Collection<string, GuildMember> = cachedEveryMember(guild)
        ? guild.members.cache
        : await guild.members.fetch().catch((err) => { console.log(err); return guild.members.cache })

    const names = new Map<string, IMemberName>()
    members.forEach(member => names.set(member.id, {
        name: member.displayName,
        username: member.user.username,
        nickname: member.nickname,
    }))
    return names
}

const getNamedPointEvents = async (guild: Guild): Promise<INamedPointEvent[]> => {
    const events = await allPointEvents()
    const names = await memberNames(guild)

    return events.map(({userId, ...event}) => ({...event, ...(names.get(userId) ?? departedMember(userId))}))
}

export default getNamedPointEvents
