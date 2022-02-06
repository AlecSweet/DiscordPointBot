import { userMutexes } from "..";
import challengeModel, { deleteChallenge, IChallengeRet } from "../db/challenge";
import { incUser } from "./userUtil";

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

export const cancelChallenge = async (ownerId: string, challenge: IChallengeRet) => {
    const ownerMutex = userMutexes.get(ownerId)
    if (ownerMutex) {
        await ownerMutex.runExclusive(async() => {
            await incUser(ownerId, {points: challenge.ownerBet})
        }).catch(err => {console.log(err)})
    } else {
        await incUser(ownerId, {points: challenge.ownerBet})
    }

    if (challenge.acceptId !== '') {
        const targetMutex = userMutexes.get(challenge.acceptId)
        if (targetMutex) {
            await targetMutex.runExclusive(async() => {
                await incUser(challenge.acceptId, {points: challenge.acceptBet})
            }).catch(err => {console.log(err)})
        } else {
            await incUser(challenge.acceptId, {points: challenge.acceptBet})
        }
    }
    await deleteChallenge(ownerId)
}