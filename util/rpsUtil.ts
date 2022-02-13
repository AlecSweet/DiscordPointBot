import { userMutexes } from "..";
import rpsModel, { deleteRps, IRpsRet } from "../db/rps";
import { incUser } from "./userUtil";

export const checkAndCancelMaroonedRps = async () => {
    const rpss = await rpsModel.find({})
    if (rpss) {
        await rpss.forEach(async rps => {
            if ((new Date()).getTime() - rps.startDate.getTime() > 6 * 60 * 1000) {
                console.log('deleting marooned rps')
                await cancelRps(rps.ownerId, rps)
            }
        })
    }
}

export const cancelRps = async (ownerId: string, rps: IRpsRet) => {
    const ownerMutex = userMutexes.get(ownerId)
    if (ownerMutex) {
        await ownerMutex.runExclusive(async() => {
            await incUser(ownerId, {points: rps.ownerBet})
        }).catch(err => {console.log(err)})
    } else {
        await incUser(ownerId, {points: rps.ownerBet})
    }

    if (rps.acceptId !== '') {
        const targetMutex = userMutexes.get(rps.acceptId)
        if (targetMutex) {
            await targetMutex.runExclusive(async() => {
                await incUser(rps.acceptId, {points: rps.acceptBet})
            }).catch(err => {console.log(err)})
        } else {
            await incUser(rps.acceptId, {points: rps.acceptBet})
        }
    }
    await deleteRps(ownerId)
}