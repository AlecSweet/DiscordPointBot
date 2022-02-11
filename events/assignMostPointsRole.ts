import { Guild } from "discord.js"
import userModel from "../db/user"
import * as dotenv from "dotenv"
import { userMutexes } from ".."
import getUser from "../util/userUtil"
dotenv.config()

const assignMostPointsRole = async (guild: Guild) => {
    const roleId = process.env.MOST_POINTS_ROLE_ID ? process.env.MOST_POINTS_ROLE_ID : ''
    const wealthiestRole = guild.roles.cache.get(roleId);

    const top = await userModel.aggregate([
        {$sort:{points:-1}},
        {$limit: 5}
    ])

    if (top) {
        let topUserId
        let topUserPoints = 0 
        for(const user of top) {
            const userMutex = userMutexes.get(user.id)
            if (!userMutex) { return }
            let tempUser
            await userMutex.runExclusive(async() => {
                tempUser = await getUser(user.id)
            }).catch((err) => console.log(err))
            if (tempUser) {
                if (tempUser.points > topUserPoints) {
                    topUserId = tempUser.id
                    topUserPoints = tempUser.points
                }
            }
        }

        if (wealthiestRole && topUserId) {
            wealthiestRole.members.forEach(async member => {
                if (member.id !== topUserId) {
                    await member.roles.remove(wealthiestRole)
                }
            })
            const topMember = guild.members.cache.get(topUserId)
            if (topMember && !topMember.roles.cache.has(roleId)) {
                await topMember.roles.add(wealthiestRole)
            }
        }
    }
}

export default assignMostPointsRole

export const assignDustedRole = async (guild: Guild, userId: string) => {
    const roleId = process.env.DUSTED_ROLE_ID ? process.env.DUSTED_ROLE_ID : ''
    const dustedRole = guild.roles.cache.get(roleId);

    if (dustedRole) {
        dustedRole.members.forEach(async member => {
            if (member.id !== userId) {
                await member.roles.remove(dustedRole)
            }
        })
        const dustedMember = guild.members.cache.get(userId)
        if (dustedMember && !dustedMember.roles.cache.has(roleId)) {
            await dustedMember.roles.add(dustedRole)
        }
    }
}