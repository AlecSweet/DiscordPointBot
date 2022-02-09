import { userMutexes } from "..";
import warModel, { deleteWar, IwarRet } from "../db/war";
import { incUser } from "./userUtil";

export const checkAndCancelMaroonedWars = async () => {
    const wars = await warModel.find({})
    if (wars) {
        await wars.forEach(async war => {
            if ((new Date()).getTime() - war.startDate.getTime() > 20 * 60 * 1000) {

                console.log('deleting marooned war')
                await cancelWar(war.ownerId, war)
            }
        })
    }
}

export const cancelWar = async (ownerId: string, war: IwarRet) => {
    const ownerMutex = userMutexes.get(ownerId)
    if (ownerMutex) {
        await ownerMutex.runExclusive(async() => {
            await incUser(ownerId, {points: war.ownerBet})
        }).catch(err => {console.log(err)})
    } else {
        await incUser(ownerId, {points: war.ownerBet})
    }

    if (war.acceptId !== '') {
        const targetMutex = userMutexes.get(war.acceptId)
        if (targetMutex) {
            await targetMutex.runExclusive(async() => {
                await incUser(war.acceptId, {points: war.acceptBet})
            }).catch(err => {console.log(err)})
        } else {
            await incUser(war.acceptId, {points: war.acceptBet})
        }
    }
    await deleteWar(ownerId)
}