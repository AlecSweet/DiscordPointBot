import warModel, { deleteWar, IwarRet } from "../db/war";
import { inc, updateUser } from "./userUtil";

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
    await updateUser(ownerId, {points: inc(war.ownerBet)})

    if (war.acceptId !== '') {
        await updateUser(war.acceptId, {points: inc(war.acceptBet)})
    }
    await deleteWar(ownerId)
}