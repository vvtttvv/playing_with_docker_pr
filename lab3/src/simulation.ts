/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import { Board } from './board.js';

/**
 * Example code for simulating a game.
 * 
 * PS4 instructions: you may use, modify, or remove this file,
 *   completing it is recommended but not required.
 * 
 * @throws Error if an error occurs reading or parsing the board
 */
async function simulationMain(): Promise<void> {
    const filename = 'boards/ab.txt';
    const board: Board = await Board.parseFromFile(filename);
    const size = 5;
    const players = 1; // Change this to 3 or more for multi-player simulation
    const tries = 10;
    const maxDelayMilliseconds = 100;

    // start up one or more players as concurrent asynchronous function calls
    const playerPromises: Array<Promise<void>> = [];
    for (let ii = 0; ii < players; ++ii) {
        playerPromises.push(player(ii));
    }
    // wait for all the players to finish (unless one throws an exception)
    await Promise.all(playerPromises);

    /** @param playerNumber player to simulate */
    async function player(playerNumber: number): Promise<void> {
        const playerId = `player${playerNumber}`;
        
        console.log(`${playerId} starting simulation...`);

        for (let jj = 0; jj < tries; ++jj) {
            try {
                await timeout(Math.random() * maxDelayMilliseconds);
                // Try to flip over a first card at a random position
                // which might wait until this player can control that card
                const firstRow = randomInt(size);
                const firstCol = randomInt(size);
                console.log(`${playerId} attempt ${jj + 1}: flipping first card at (${firstRow},${firstCol})`);
                await board.flip(playerId, firstRow, firstCol);

                await timeout(Math.random() * maxDelayMilliseconds);
                // If that succeeded, try to flip over a second card at a random position
                const secondRow = randomInt(size);
                const secondCol = randomInt(size);
                console.log(`${playerId} attempt ${jj + 1}: flipping second card at (${secondRow},${secondCol})`);
                await board.flip(playerId, secondRow, secondCol);
            } catch (err) {
                console.error(`${playerId} attempt to flip a card failed:`, err);
            }
        }
        
        console.log(`${playerId} finished simulation.`);
    }
}

/**
 * Random positive integer generator
 * 
 * @param max a positive integer which is the upper bound of the generated number
 * @returns a random integer >= 0 and < max
 */
function randomInt(max: number): number {
    return Math.floor(Math.random() * max);
}


/**
 * @param milliseconds duration to wait
 * @returns a promise that fulfills no less than `milliseconds` after timeout() was called
 */
async function timeout(milliseconds: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, milliseconds);
    return promise;
}

void simulationMain();
