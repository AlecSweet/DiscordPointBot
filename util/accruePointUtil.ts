import { getUser, IUser, updateUser } from "../db/user"

const accruePoints = async (user: IUser, activeDate?: Date | null): Promise<IUser> => {
    if (user.activeStartDate) {
        const currentDate = new Date()
        const timeDifference = Math.abs(currentDate.getTime() - user.activeStartDate.getTime())

        const msLeftOver = timeDifference % 60000
        const newActiveStartDate = new Date(currentDate.getTime() - msLeftOver)

        const minutesActive = Math.floor(timeDifference / 60000)
        user = await updateUser(
            user.id, 
            user.points + minutesActive, 
            activeDate !== undefined ? activeDate : newActiveStartDate
        )
    }

    return user
}

export const disableUserActivityAndAccruePoints = async (id: string): Promise<IUser> => {
    const user = await getUser(id)
    return await accruePoints(user, null)
}

const getUserAndAccruePoints = async (id: string): Promise<IUser> => {
    const user = await getUser(id)
    return await accruePoints(user)
}

export default getUserAndAccruePoints