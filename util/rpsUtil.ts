import rpsModel, { deleteRps, IRpsRet } from "../db/rps";
import { IPointOrigin } from "../db/pointEvent";
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

export const cancelRps = async (ownerId: string, rps: IRpsRet, origin: IPointOrigin = {command: "rps"}) => {
    await updateUser(ownerId, {points: inc(rps.ownerBet)}, {...origin, reason: "rpsRefund"})

    if (rps.acceptId !== '') {
        await updateUser(rps.acceptId, {points: inc(rps.acceptBet)}, {...origin, reason: "rpsRefund"})
    }
    await deleteRps(ownerId)
}