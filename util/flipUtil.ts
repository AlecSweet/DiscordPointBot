import { Guild } from "discord.js";
import { IPointChange } from "../db/pointEvent";
import { IUser } from "../db/user";
import { assignDustedRole } from "../events/assignMostPointsRole";
import { inc, set, updateUser } from "./userUtil";

export const checkAndAssignDusted = async (guild: Guild, user: IUser, bet: number) => {
    if (bet >= 100 && user.points < 5) {
        await assignDustedRole(guild, user.id)
    }
}

const nextStreak = (current: number, direction: 1 | -1): number => {
    const continuesStreak = Math.sign(current) === direction
    return continuesStreak ? current + direction : direction
}

export const updateUserWin = async (user: IUser, points: number, change: IPointChange): Promise<IUser> => {
    const flipStreak = nextStreak(user.flipStreak, 1)
    return await updateUser(user.id, {
        points: inc(points),
        pointsWon: inc(points),
        flipsWon: inc(1),
        flipStreak: set(flipStreak),
        maxWinStreak: set(Math.max(user.maxWinStreak, flipStreak))
    }, change)
}

export const updateUserLoss = async (user: IUser, points: number, change: IPointChange): Promise<IUser> => {
    const flipStreak = nextStreak(user.flipStreak, -1)
    return await updateUser(user.id, {
        points: inc(-points),
        pointsLost: inc(points),
        flipsLost: inc(1),
        flipStreak: set(flipStreak),
        maxLossStreak: set(Math.max(user.maxLossStreak, -flipStreak))
    }, change)
}
