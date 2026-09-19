import rpsModel, { deleteRps, getRps, IRpsRet } from "../db/rps";
import { IPointOrigin } from "../db/pointEvent";
import { IUser } from "../db/user";
import { whileSettling } from "./settling";
import sweepMarooned from "./maroonedGames";
import { inc, updateUser } from "./userUtil";

const MAROONED_MS = 6 * 60 * 1000

export const checkAndCancelMaroonedRps = (): Promise<void> =>
    sweepMarooned(() => rpsModel.find({}), MAROONED_MS, "rps", cancelRps)

export const cancelRps = (ownerId: string, rps: IRpsRet, origin: IPointOrigin = {command: "rps"}): Promise<void> =>
    whileSettling(async () => {
        const current = await getRps(ownerId) ?? rps

        await Promise.all([
            updateUser(ownerId, {points: inc(current.ownerBet)}, {...origin, reason: "rpsRefund"}),
            current.acceptId === '' ? Promise.resolve() :
                updateUser(current.acceptId, {points: inc(current.acceptBet)}, {...origin, reason: "rpsRefund"}),
        ])
        await deleteRps(ownerId)
    })

export const payRps = (ownerId: string, winnerId: string, loserId: string, bet: number, origin: IPointOrigin): Promise<IUser> =>
    whileSettling(async () => {
        const [, loser] = await Promise.all([
            updateUser(winnerId, {points: inc(bet * 2), rpsPointsWon: inc(bet), rpsWon: inc(1)}, {...origin, reason: "rpsPayout"}),
            updateUser(loserId, {rpsPointsLost: inc(bet), rpsLost: inc(1)}),
        ])
        await deleteRps(ownerId)
        return loser
    })
