import { Schema, model } from "mongoose";
import * as dotenv from "dotenv"
dotenv.config()

export interface IUser {
    id: string
    points: number
    activeStartDate: Date | null
    flipsLost: number
    flipsWon: number
    pointsWon: number
    pointsLost: number
    secondsActive: number
    cooldown: Date
    flipStreak: number
    maxWinStreak: number
    maxLossStreak: number
    dailyClaim: Date
    weeklyClaim: Date
    pointsGiven: number
    pointsRecieved: number
    pointsClaimed: number
    betPointsWon: number
    betPointsLost: number
    betsWon: number
    betsLost: number
    betsOpened: number
    challengePointsWon: number
    challengePointsLost: number
    challengesWon: number
    challengesLost: number
    warPointsWon: number
    warPointsLost: number
    warsWon: number
    warsLost: number
}

export interface IUserUpdates {
    points?: number
    activeStartDate?: Date | null
    flipsLost?: number
    flipsWon?: number
    pointsWon?: number
    pointsLost?: number
    secondsActive?: number
    cooldown?: Date
    flipStreak?: number
    maxWinStreak?: number
    maxLossStreak?: number
    dailyClaim?: Date
    weeklyClaim?: Date
    pointsGiven?: number
    pointsRecieved?: number
    pointsClaimed?: number
    betPointsWon?: number
    betPointsLost?: number
    betsWon?: number
    betsLost?: number
    betsOpened?:  number
    challengePointsWon?: number
    challengePointsLost?: number
    challengesWon?: number
    challengesLost?: number
    warPointsWon?: number
    warPointsLost?: number
    warsWon?: number
    warsLost?: number
}

const userSchema = new Schema({
    id: {
        type: String,
        required: true,
    },
    points: {
        type: Number,
        default: process.env.DEFAULT_POINTS
    },
    activeStartDate: {
        type: Date,
        default: null
    },
    flipsLost: {
        type: Number,
        default: 0
    },
    flipsWon: {
        type: Number,
        default: 0
    },
    pointsWon: {
        type: Number,
        default: 0
    },
    pointsLost: {
        type: Number,
        default: 0
    },
    secondsActive: {
        type: Number,
        default: 0
    },
    cooldown: {
        type: Date,
        default: new Date()
    },
    flipStreak: {
        type: Number,
        default: 0
    },
    maxWinStreak: {
        type: Number,
        default: 0
    },
    maxLossStreak: {
        type: Number,
        default: 0
    },
    dailyClaim: {
        type: Date,
        default: null
    },
    weeklyClaim: {
        type: Date,
        default: null
    },
    pointsGiven: {
        type: Number,
        default: 0
    },
    pointsRecieved: {
        type: Number,
        default: 0
    },
    pointsClaimed: {
        type: Number,
        default: 0
    },
    betPointsWon: {
        type: Number,
        default: 0
    },
    betPointsLost: {
        type: Number,
        default: 0
    },
    betsWon: {
        type: Number,
        default: 0
    },
    betsLost: {
        type: Number,
        default: 0
    },
    betsOpened: {
        type: Number,
        default: 0
    },
    challengePointsWon: {
        type: Number,
        default: 0
    },
    challengePointsLost: {
        type: Number,
        default: 0
    },
    challengesWon: {
        type: Number,
        default: 0
    },
    challengesLost: {
        type: Number,
        default: 0
    },
    warPointsWon: {
        type: Number,
        default: 0
    },
    warPointsLost: {
        type: Number,
        default: 0
    },
    warsWon: {
        type: Number,
        default: 0
    },
    warsLost: {
        type: Number,
        default: 0
    },
})

const userModel = model['user'] || model('user', userSchema);

export default userModel;

