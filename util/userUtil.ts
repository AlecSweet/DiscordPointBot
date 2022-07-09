import userModel, { IUser, IUserUpdates } from "../db/user"

const accruePoints = async (user: IUser, disableActivity: boolean): Promise<IUser> => {
    if (user.activeStartDate) {
        const currentDate = new Date()
        const timeDifference = Math.abs(currentDate.getTime() - user.activeStartDate.getTime())

        const msLeftOver = timeDifference % 60000
        const newActiveStartDate = new Date(currentDate.getTime() - msLeftOver)

        const minutesActive = Math.floor(timeDifference / 60000)
        await incUser(user.id, {points: minutesActive, secondsActive: minutesActive * 60})
        user = await updateUser(user.id, {activeStartDate: disableActivity ? null : newActiveStartDate})
    }

    return user
}

export const addPoints = async(id: string, points: number): Promise<IUser> => {
    return await incUser(id, {points: points})
}

export const addPointsAndAccrue = async(id: string, points: number): Promise<IUser> => {
    const user = await incUser(id, {points: points})
    return await accruePoints(user, false)
}

export const disableUserActivityAndAccruePoints = async (id: string): Promise<IUser> => {
    const user = await updateUser(id, {cooldown: new Date()})
    return await accruePoints(user, true)
}

const getUser = async (id: string): Promise<IUser> => {
    const user = await getUserNoAccrue(id)
    return await accruePoints(user, false)
}

export default getUser

/*export const checkAndTriggerUserCooldown = async (id: string): Promise<number> => {
    const user = await getUserNoAccrue(id)
    const currentDate = new Date()
    if (!user.cooldown || currentDate.getTime() - user.cooldown.getTime() > 3000) {
        updateUser(id, {cooldown: currentDate})
        return -1
    }
    return 3000 - (currentDate.getTime() - user.cooldown.getTime())
}*/

/*const cooldown = await checkAndTriggerUserCooldown(id)
if (cooldown > -1) {
    message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${id}> ${process.env.NOPPERS_EMOJI}`})
    return
}*/

export const getAllUsers = async (): Promise<IUser[]> => {
    const findResult = await userModel.find()
    const users = findResult.map(userEntry => {
        return {
            id: userEntry.id, 
            points: userEntry.points, 
            activeStartDate: userEntry.activeStartDate,
            flipsLost: userEntry.flipsLost,
            flipsWon: userEntry.flipsWon,
            pointsWon: userEntry.pointsWon,
            pointsLost: userEntry.pointsLost,
            secondsActive: userEntry.secondsActive,
            cooldown: userEntry.cooldown,
            flipStreak: userEntry.flipStreak,
            maxWinStreak: userEntry.maxWinStreak,
            maxLossStreak: userEntry.maxLossStreak,
            dailyClaim: userEntry.dailyClaim,
            weeklyClaim: userEntry.weeklyClaim,
            pointsGiven: userEntry.pointsGiven,
            pointsRecieved: userEntry.pointsRecieved,
            pointsClaimed: userEntry.pointsClaimed,
            betPointsWon: userEntry.betPointsWon,
            betPointsLost: userEntry.betPointsLost,
            betsWon: userEntry.betsWon,
            betsLost: userEntry.betsLost,
            betsOpened:  userEntry.betsOpened,
            challengePointsWon: userEntry.challengePointsWon,
            challengePointsLost: userEntry.challengePointsLost,
            challengesWon: userEntry.challengesWon,
            challengesLost: userEntry.challengesLost,
            warPointsWon: userEntry.warPointsWon,
            warPointsLost: userEntry.warPointsLost,
            warsWon:userEntry.warsWon,
            warsLost: userEntry.warsLost,
            rpsPointsWon: userEntry.rpsPointsWon,
            rpsPointsLost: userEntry.rpsPointsLost,
            rpsWon:userEntry.rpsWon,
            rpsLost: userEntry.rpsLost,
        }
    })
    return users
}

export const getUserNoAccrue = async (id: string): Promise<IUser> => {
    const findResult = await userModel.findOne({id})
    const userEntry = findResult ? findResult : await insertUser(id)
    return {
        id: userEntry.id, 
        points: userEntry.points, 
        activeStartDate: userEntry.activeStartDate,
        flipsLost: userEntry.flipsLost,
        flipsWon: userEntry.flipsWon,
        pointsWon: userEntry.pointsWon,
        pointsLost: userEntry.pointsLost,
        secondsActive: userEntry.secondsActive,
        cooldown: userEntry.cooldown,
        flipStreak: userEntry.flipStreak,
        maxWinStreak: userEntry.maxWinStreak,
        maxLossStreak: userEntry.maxLossStreak,
        dailyClaim: userEntry.dailyClaim,
        weeklyClaim: userEntry.weeklyClaim,
        pointsGiven: userEntry.pointsGiven,
        pointsRecieved: userEntry.pointsRecieved,
        pointsClaimed: userEntry.pointsClaimed,
        betPointsWon: userEntry.betPointsWon,
        betPointsLost: userEntry.betPointsLost,
        betsWon: userEntry.betsWon,
        betsLost: userEntry.betsLost,
        betsOpened:  userEntry.betsOpened,
        challengePointsWon: userEntry.challengePointsWon,
        challengePointsLost: userEntry.challengePointsLost,
        challengesWon: userEntry.challengesWon,
        challengesLost: userEntry.challengesLost,
        warPointsWon: userEntry.warPointsWon,
        warPointsLost: userEntry.warPointsLost,
        warsWon:userEntry.warsWon,
        warsLost: userEntry.warsLost,
        rpsPointsWon: userEntry.rpsPointsWon,
        rpsPointsLost: userEntry.rpsPointsLost,
        rpsWon:userEntry.rpsWon,
        rpsLost: userEntry.rpsLost,
    }
}

export const incUser = async (id: string, updates: IUserUpdates): Promise<IUser> => {
    const updateResult = await userModel.findOneAndUpdate({id}, {$inc: {...(updates)}}, {new: true})
    const userEntry = updateResult ? updateResult : await insertUser(id, updates)
    return {
        id, 
        points: userEntry.points, 
        activeStartDate: userEntry.activeStartDate,
        flipsLost: userEntry.flipsLost,
        flipsWon: userEntry.flipsWon,
        pointsWon: userEntry.pointsWon,
        pointsLost: userEntry.pointsLost,
        secondsActive: userEntry.secondsActive,
        cooldown: userEntry.cooldown,
        flipStreak: userEntry.flipStreak,
        maxWinStreak: userEntry.maxWinStreak,
        maxLossStreak: userEntry.maxLossStreak,
        dailyClaim: userEntry.dailyClaim,
        weeklyClaim: userEntry.weeklyClaim,
        pointsGiven: userEntry.pointsGiven,
        pointsRecieved: userEntry.pointsRecieved,
        pointsClaimed: userEntry.pointsClaimed,
        betPointsWon: userEntry.betPointsWon,
        betPointsLost: userEntry.betPointsLost,
        betsWon: userEntry.betsWon,
        betsLost: userEntry.betsLost,
        betsOpened:  userEntry.betsOpened,
        challengePointsWon: userEntry.challengePointsWon,
        challengePointsLost: userEntry.challengePointsLost,
        challengesWon: userEntry.challengesWon,
        challengesLost: userEntry.challengesLost,
        warPointsWon: userEntry.warPointsWon,
        warPointsLost: userEntry.warPointsLost,
        warsWon:userEntry.warsWon,
        warsLost: userEntry.warsLost,
        rpsPointsWon: userEntry.rpsPointsWon,
        rpsPointsLost: userEntry.rpsPointsLost,
        rpsWon:userEntry.rpsWon,
        rpsLost: userEntry.rpsLost,
    }
}

export const updateUser = async (id: string, updates: IUserUpdates): Promise<IUser> => {
    const updateResult = await userModel.findOneAndUpdate({id}, {$set: {...(updates)}}, {new: true})
    const userEntry = updateResult ? updateResult : await insertUser(id, updates)
    return {
        id, 
        points: userEntry.points, 
        activeStartDate: userEntry.activeStartDate,
        flipsLost: userEntry.flipsLost,
        flipsWon: userEntry.flipsWon,
        pointsWon: userEntry.pointsWon,
        pointsLost: userEntry.pointsLost,
        secondsActive: userEntry.secondsActive,
        cooldown: userEntry.cooldown,
        flipStreak: userEntry.flipStreak,
        maxWinStreak: userEntry.maxWinStreak,
        maxLossStreak: userEntry.maxLossStreak,
        dailyClaim: userEntry.dailyClaim,
        weeklyClaim: userEntry.weeklyClaim,
        pointsGiven: userEntry.pointsGiven,
        pointsRecieved: userEntry.pointsRecieved,
        pointsClaimed: userEntry.pointsClaimed,
        betPointsWon: userEntry.betPointsWon,
        betPointsLost: userEntry.betPointsLost,
        betsWon: userEntry.betsWon,
        betsLost: userEntry.betsLost,
        betsOpened:  userEntry.betsOpened,
        challengePointsWon: userEntry.challengePointsWon,
        challengePointsLost: userEntry.challengePointsLost,
        challengesWon: userEntry.challengesWon,
        challengesLost: userEntry.challengesLost,
        warPointsWon: userEntry.warPointsWon,
        warPointsLost: userEntry.warPointsLost,
        warsWon:userEntry.warsWon,
        warsLost: userEntry.warsLost,
        rpsPointsWon: userEntry.rpsPointsWon,
        rpsPointsLost: userEntry.rpsPointsLost,
        rpsWon:userEntry.rpsWon,
        rpsLost: userEntry.rpsLost,
    }
}

const insertUser = async (id: string, updates?: IUserUpdates): Promise<IUser> => {
    const userEntry = await new userModel({id, ...(updates !== undefined ? updates : {})}).save()
    return {
        id: userEntry.id, 
        points: userEntry.points, 
        activeStartDate: userEntry.activeStartDate,
        flipsLost: userEntry.flipsLost,
        flipsWon: userEntry.flipsWon,
        pointsWon: userEntry.pointsWon,
        pointsLost: userEntry.pointsLost,
        secondsActive: userEntry.secondsActive,
        cooldown: userEntry.cooldown,
        flipStreak: userEntry.flipStreak,
        maxWinStreak: userEntry.maxWinStreak,
        maxLossStreak: userEntry.maxLossStreak,
        dailyClaim: userEntry.dailyClaim,
        weeklyClaim: userEntry.weeklyClaim,
        pointsGiven: userEntry.pointsGiven,
        pointsRecieved: userEntry.pointsRecieved,
        pointsClaimed: userEntry.pointsClaimed,
        betPointsWon: userEntry.betPointsWon,
        betPointsLost: userEntry.betPointsLost,
        betsWon: userEntry.betsWon,
        betsLost: userEntry.betsLost,
        betsOpened:  userEntry.betsOpened,
        challengePointsWon: userEntry.challengePointsWon,
        challengePointsLost: userEntry.challengePointsLost,
        challengesWon: userEntry.challengesWon,
        challengesLost: userEntry.challengesLost,
        warPointsWon: userEntry.warPointsWon,
        warPointsLost: userEntry.warPointsLost,
        warsWon:userEntry.warsWon,
        warsLost: userEntry.warsLost,
        rpsPointsWon: userEntry.rpsPointsWon,
        rpsPointsLost: userEntry.rpsPointsLost,
        rpsWon:userEntry.rpsWon,
        rpsLost: userEntry.rpsLost,
    }
}