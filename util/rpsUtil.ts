import rpsModel, { deleteRps, IRpsRet } from "../db/rps";
import { inc, updateUser } from "./userUtil";

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
    await updateUser(ownerId, {points: inc(rps.ownerBet)})

    if (rps.acceptId !== '') {
        await updateUser(rps.acceptId, {points: inc(rps.acceptBet)})
    }
    await deleteRps(ownerId)
}