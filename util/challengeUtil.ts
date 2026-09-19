import challengeModel, { deleteChallenge, getChallenge, IChallengeRet } from "../db/challenge";
import { IPointOrigin } from "../db/pointEvent";
import { IUser } from "../db/user";
import { whileSettling } from "./settling";
import sweepMarooned from "./maroonedGames";
import { inc, updateUser } from "./userUtil";

const MAROONED_MS = 6 * 60 * 1000

export const checkAndCancelMaroonedChallenges = (): Promise<void> =>
    sweepMarooned(() => challengeModel.find({}), MAROONED_MS, "challenge", cancelChallenge)

export const cancelChallenge = (ownerId: string, challenge: IChallengeRet, origin: IPointOrigin = {command: "challenge"}): Promise<void> =>
    whileSettling(async () => {
        const current = await getChallenge(ownerId) ?? challenge

        await Promise.all([
            updateUser(ownerId, {points: inc(current.ownerBet)}, {...origin, reason: "challengeRefund"}),
            current.acceptId === '' ? Promise.resolve() :
                updateUser(current.acceptId, {points: inc(current.acceptBet)}, {...origin, reason: "challengeRefund"}),
        ])
        await deleteChallenge(ownerId)
    })

export const payChallenge = (ownerId: string, winnerId: string, loserId: string, bet: number, origin: IPointOrigin): Promise<IUser> =>
    whileSettling(async () => {
        const [, loser] = await Promise.all([
            updateUser(winnerId, {points: inc(bet * 2), challengePointsWon: inc(bet), challengesWon: inc(1)}, {...origin, reason: "challengePayout"}),
            updateUser(loserId, {challengePointsLost: inc(bet), challengesLost: inc(1)}),
        ])
        await deleteChallenge(ownerId)
        return loser
    })
