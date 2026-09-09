import { Guild } from "discord.js";
import { IUser } from "../db/user";
import { assignDustedRole } from "../events/assignMostPointsRole";
import { addPoints, updateUser } from "./userUtil";

export const checkAndAssignDusted = async (guild: Guild, user: IUser, bet: number) => {
    if (bet >= 100 && user.points < 5) {
        await assignDustedRole(guild, user.id)
    }
}

export const updateUserWin = async (user: IUser, points: number): Promise<IUser> => {
    await addPoints(user.id, points)

    let newMaxStreak = {}
    let flipStreak = user.flipStreak
    if (flipStreak < 0) {  
        if (Math.abs(flipStreak) > user.maxLossStreak) {
            newMaxStreak = {maxLossStreak: Math.abs(flipStreak)}
        }
        flipStreak = 0
    } else if (flipStreak + 1 > user.maxWinStreak) {
        newMaxStreak = {maxWinStreak: flipStreak + 1}
    }

    return await updateUser(
        user.id, 
        {
            pointsWon: user.pointsWon + points, 
            flipsWon: user.flipsWon + 1, 
            ...(newMaxStreak), 
            flipStreak: flipStreak + 1
        }
    )
}

export const updateUserLoss = async (user: IUser, points: number): Promise<IUser> => {
    await addPoints(user.id, -points)

    let newMaxStreak = {}
    let flipStreak = user.flipStreak
    if (flipStreak > 0) {  
        if (flipStreak > user.maxWinStreak) {
            newMaxStreak = {maxWinStreak: flipStreak}
        }
        flipStreak = 0
    } else if (Math.abs(flipStreak - 1) > user.maxLossStreak) {
        newMaxStreak = {maxLossStreak: Math.abs(flipStreak - 1)}
    }
    return await updateUser(
        user.id, 
        {
            pointsLost: user.pointsLost + points, 
            flipsLost: user.flipsLost + 1, 
            ...(newMaxStreak), 
            flipStreak: flipStreak - 1
        }
    )
}
