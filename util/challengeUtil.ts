import challengeModel, { deleteChallenge, IChallengeRet } from "../db/challenge";
import { IPointOrigin } from "../db/pointEvent";
import { inc, updateUser } from "./userUtil";

export const checkAndCancelMaroonedChallenges = async () => {
    const challenges = await challengeModel.find({})
    if (challenges) {
        await challenges.forEach(async challenge => {
            if ((new Date()).getTime() - challenge.startDate.getTime() > 6 * 60 * 1000) {

                console.log('deleting marooned challenge')
                await cancelChallenge(challenge.ownerId, challenge)
            }
        })
    }
}

export const cancelChallenge = async (ownerId: string, challenge: IChallengeRet, origin: IPointOrigin = {command: "challenge"}) => {
    await updateUser(ownerId, {points: inc(challenge.ownerBet)}, {...origin, reason: "challengeRefund"})

    if (challenge.acceptId !== '') {
        await updateUser(challenge.acceptId, {points: inc(challenge.acceptBet)}, {...origin, reason: "challengeRefund"})
    }
    await deleteChallenge(ownerId)
}