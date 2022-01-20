import { getUser, IUser, updateUser } from "../db/user"

const accruePoints = async (user: IUser, disableActivity: boolean, addPoints?: number): Promise<IUser> => {
    if (user.activeStartDate) {
        const currentDate = new Date()
        const timeDifference = Math.abs(currentDate.getTime() - user.activeStartDate.getTime())

        const msLeftOver = timeDifference % 60000
        const newActiveStartDate = new Date(currentDate.getTime() - msLeftOver)

        const minutesActive = Math.floor(timeDifference / 60000)
        user = await updateUser(
            user.id, 
            user.points + minutesActive + (addPoints ? addPoints : 0), 
            disableActivity ? null : newActiveStartDate
        )
    } else if (!user.activeStartDate && addPoints) {
        user = await updateUser(
            user.id, 
            user.points + addPoints
        )
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

export default getUserAndAccruePoints