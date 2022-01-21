import { getUser, IUser, updateUser } from "../db/user"

const accruePoints = async (user: IUser, disableActivity: boolean, addPoints?: number): Promise<IUser> => {
    addPoints = (addPoints !== undefined ? addPoints : 0)
    
    if (user.activeStartDate) {
        const currentDate = new Date()
        const timeDifference = Math.abs(currentDate.getTime() - user.activeStartDate.getTime())

        const msLeftOver = timeDifference % 60000
        const newActiveStartDate = new Date(currentDate.getTime() - msLeftOver)

        const minutesActive = Math.floor(timeDifference / 60000)
        user = await updateUser(
            user.id, 
            {
                points: user.points + minutesActive + addPoints, 
                activeStartDate: disableActivity ? null : newActiveStartDate,
                secondsActive: user.secondsActive + (minutesActive * 60)
            }
        )
    } else if (!user.activeStartDate && addPoints) {
        user = await updateUser(user.id, {points: user.points + addPoints})
    }

    return user
}

export const addPoints = async(user: IUser, points: number): Promise<IUser> => {
    return await accruePoints(user, false, points)
}

export const disableUserActivityAndAccruePoints = async (id: string): Promise<IUser> => {
    const user = await getUser(id)
    return await accruePoints(user, true)
}

const getUserAndAccruePoints = async (id: string): Promise<IUser> => {
    const user = await getUser(id)
    return await accruePoints(user, false)
}

export const checkAndTriggerUserCooldown = async (id: string): Promise<number> => {
    const user = await getUser(id)
    const currentDate = new Date()
    if (!user.cooldown || currentDate.getTime() - user.cooldown.getTime() > 10000) {
        updateUser(id, {cooldown: currentDate})
        return -1
    }
    return 10000 - (currentDate.getTime() - user.cooldown.getTime())
}

export default getUserAndAccruePoints