import warModel, { deleteWar, getWar, IwarRet } from "../db/war";
import { IPointOrigin } from "../db/pointEvent";
import { whileSettling } from "./settling";
import sweepMarooned from "./maroonedGames";
import { inc, updateUser } from "./userUtil";

const MAROONED_MS = 20 * 60 * 1000

export const checkAndCancelMaroonedWars = (): Promise<void> =>
    sweepMarooned(() => warModel.find({}), MAROONED_MS, "war", cancelWar)

export const cancelWar = (ownerId: string, war: IwarRet, origin: IPointOrigin = {command: "war"}): Promise<void> =>
    whileSettling(async () => {
        const current = await getWar(ownerId) ?? war

        await Promise.all([
            updateUser(ownerId, {points: inc(current.ownerBet)}, {...origin, reason: "warRefund"}),
            current.acceptId === '' ? Promise.resolve() :
                updateUser(current.acceptId, {points: inc(current.acceptBet)}, {...origin, reason: "warRefund"}),
        ])
        await deleteWar(ownerId)
    })

export const payWar = (ownerId: string, winnerId: string, loserId: string, pot: number, stake: number, origin: IPointOrigin): Promise<void> =>
    whileSettling(async () => {
        await Promise.all([
            updateUser(winnerId, {points: inc(pot), warPointsWon: inc(stake), warsWon: inc(1)}, {...origin, reason: "warPayout"}),
            updateUser(loserId, {warPointsLost: inc(stake), warsLost: inc(1)}),
        ])
        await deleteWar(ownerId)
    })
