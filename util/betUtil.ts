import { Guild } from "discord.js"
import { userMutexes } from ".."
import betModel, { deleteBet, getBet, IUserBet } from "../db/bet"
import { addPoints } from "./userUtil"

const maxOdds = 4

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
    won: boolean
    bet: number
}

export const getPayouts = (userBets: IUserBet[], numOutcomes: number, winningOutcome: number): IUserReturn[] => {
    const outcomeTotalsArr = new Array(numOutcomes).fill(0)

    let losersPot = 0
    let winnersPot = 0
    userBets.forEach((userBet) => {
        outcomeTotalsArr[userBet.outcome] += userBet.bet
        if (userBet.outcome !== winningOutcome) {
            losersPot += userBet.bet
        } else {
            winnersPot += userBet.bet
        }
    })

    const totalBets = losersPot + winnersPot

    const oddsArr = outcomeTotalsArr.map(odds => {
        if (odds <= 0) {
            return 0
        }
        return maxOdds && totalBets/odds > maxOdds ? maxOdds : totalBets/odds
    })

    let userReturns: IUserReturn[] = [] 
    if ( oddsArr[winningOutcome] < maxOdds ) {
        const winMult = oddsArr[winningOutcome]
        let payoutTotal = 0
        userReturns = userBets.map((userBet) => {
            const pointsToAdd = userBet.outcome === winningOutcome ? Math.floor(userBet.bet * winMult): 0
            payoutTotal += pointsToAdd
            return {userId: userBet.userId, pointsToAdd, pointsBack: false, won: userBet.outcome === winningOutcome, bet: userBet.bet}
        })

        if (payoutTotal < totalBets) {
            const winnersByPoints = userReturns.filter(uR => uR.won).sort((f, s) => {return f.bet <= s.bet ? 1 : -1})
            let roundingDistribution = totalBets - payoutTotal
            let index = 0
            while (roundingDistribution > 0) {
                winnersByPoints[index].pointsToAdd++
                index++
                if (index >= winnersByPoints.length) {
                    index = 0
                }
                roundingDistribution--
            }
        }
    } else {
        let payoutTotal = 0
        userReturns = userBets.map((userBet) => {
            const pointsToAdd = userBet.outcome === winningOutcome ? Math.floor(userBet.bet * maxOdds): 0
            payoutTotal += pointsToAdd > 0 ? pointsToAdd - userBet.bet : 0
            return {
                userId: userBet.userId, 
                pointsToAdd, 
                pointsBack: userBet.outcome !== winningOutcome, 
                won: userBet.outcome === winningOutcome, 
                bet: userBet.bet
            }
        })

        const remaingLosersPot = losersPot - payoutTotal
        let remainingPayouts = 0
        userReturns.filter(userReturn => !userReturn.won).forEach(userReturn => {
            const returnPoints = Math.floor((userReturn.bet / losersPot) * remaingLosersPot) 
            userReturn.pointsToAdd = returnPoints
            remainingPayouts += returnPoints
        })

        if (remainingPayouts < remaingLosersPot) {
            const losersByPoints = userReturns.filter(uR => !uR.won).sort((f, s) => {return f.bet <= s.bet ? 1 : -1})
            let roundingDistribution = remaingLosersPot - remainingPayouts
            let index = 0
            while (roundingDistribution > 0) {
                losersByPoints[index].pointsToAdd++
                index++
                if (index >= losersByPoints.length) {
                    index = 0
                }
                roundingDistribution--
            }
        }
    } 

    return userReturns
}

export const checkAndCancelMaroonedBets = async (guild: Guild) => {
    const bets = await betModel.find({})
    if (bets) {
        await bets.forEach(async bet => {
            if ((new Date()).getTime() - bet.startDate.getTime() > 4 * 60 * 60 * 1000) {

                console.log((new Date()).getTime(), 'currentTime')
                console.log(bet.startDate.getTime(), 'betTIme')
                const activeThreads = await guild.channels.fetchActiveThreads()
                const betThread = activeThreads.threads.find(thread => thread.id === bet.threadId)
                if (betThread) {
                    console.log('deleting bet from check maroon')
                    await betThread.delete()
                }
            
                await returnPointsDeleteBet(bet.threadId)
            }
        });
    }
}
