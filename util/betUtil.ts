import { userMutexes } from ".."
import { deleteBet, getBet, IUserBet } from "../db/bet"
import { addPoints } from "./userUtil"

const maxOdds = 2123199900

export const returnPointsDeleteBet = async (betThreadId: string) => {
    const bet = await getBet(betThreadId)
    for(const user of bet.userBets){
        const userMutex = userMutexes.get(user.userId)
        if(!userMutex) {
            return
        }
        await userMutex.runExclusive(async() => {
            await addPoints(user.userId, user.bet)
        }).catch(() => {})
    }
    await deleteBet(betThreadId)
}

export const getOdds = (userBets: IUserBet[], numOutcomes: number): number[] => {
    const oddsArr = new Array(numOutcomes).fill(0);
    let totalBets = 0
    userBets.forEach((userBet) => {
        oddsArr[userBet.outcome] += userBet.bet
        totalBets += userBet.bet
    })

    return oddsArr.map(odds => {
        if (odds <= 0) {
            return 0
        }
        return maxOdds && totalBets/odds > maxOdds ? maxOdds : totalBets/odds
    })
}

interface IUserReturn {
    userId: string
    pointsToAdd: number
    pointsBack: boolean
}

export const getPayouts = (userBets: IUserBet[], numOutcomes: number, winningOutcome: number): IUserReturn[] => {
    const outcomeTotalsArr = new Array(numOutcomes).fill(0)

    let totalBets = 0
    userBets.forEach((userBet) => {
        outcomeTotalsArr[userBet.outcome] += userBet.bet
        totalBets += userBet.bet
    })
    const oddsArr = outcomeTotalsArr.map(odds => {
        if (odds <= 0) {
            return 0
        }
        return maxOdds && totalBets/odds > maxOdds ? maxOdds : totalBets/odds
    })

    let userReturns: IUserReturn[] = [] 
    if ( oddsArr[winningOutcome] < maxOdds ) {
        const winMult = oddsArr[winningOutcome]
        userReturns = userBets.map((userBet) => {
            const pointsToAdd = userBet.outcome === winningOutcome ? Math.round(userBet.bet * winMult): -userBet.bet
            return {userId: userBet.userId, pointsToAdd, pointsBack: false}
        })
    } 

    return userReturns
}