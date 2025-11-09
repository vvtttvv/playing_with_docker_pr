/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */
import assert from 'node:assert';
import fs from 'node:fs';
/**
 * A mutable, thread-safe game board for Memory Scramble.
 *
 * The board is a grid of spaces that can contain cards. Players flip cards
 * to find matching pairs. Multiple players can interact with the board
 * concurrently, following the rules in the PS4 handout.
 */
export class Board {
    rows;
    cols;
    grid; // grid[row][col]
    players; // player ID -> state
    // For implementing waiting: when a player tries to flip a card
    // that another player controls, they wait here
    waitQueue; // position key -> waiting resolvers
    // Abstraction function:
    //   AF(rows, cols, grid, players, waitQueue) = a Memory Scramble game board
    //     with dimensions rows x cols, where grid[r][c] represents the space
    //     at row r, column c. Each space either has a card (face up or down)
    //     or is empty. players maps player IDs to their current game state
    //     (which cards they control and whether they matched). waitQueue
    //     tracks players waiting to control specific cards.
    // Representation invariant:
    //   - rows > 0, cols > 0
    //   - grid.length == rows
    //   - for all r in [0, rows): grid[r].length == cols
    //   - for all spaces: if card is null, then faceUp is false and controlledBy is null
    //   - for all spaces: if controlledBy is not null, then faceUp is true
    //   - for all players p: if p has firstCard and matched=true, that position has a card controlled by p
    //   - for all players p: if p has secondCard and matched=true, that position has a card controlled by p
    //   - for all players p: if p has firstCard/secondCard and matched=false, those cards are not controlled (rule 2-E)
    //   - no two players control the same card
    // Safety from rep exposure:
    //   - rows, cols are immutable primitives
    //   - grid is private and never returned; methods return copies or derived data
    //   - players is private; methods don't expose the map or player state objects
    //   - waitQueue is private and never exposed
    //   - all constructor parameters are copied into new objects
    /**
     * Creates a new Memory Scramble board.
     *
     * @param rows number of rows, must be > 0
     * @param cols number of columns, must be > 0
     * @param cards array of card strings to place on board, must have exactly rows * cols elements
     * @throws Error if dimensions or cards array is invalid
     */
    constructor(rows, cols, cards) {
        assert(rows > 0, "rows must be > 0");
        assert(cols > 0, "cols must be > 0");
        assert(cards.length === rows * cols, "cards array must have exactly rows * cols elements");
        this.rows = rows;
        this.cols = cols;
        this.players = new Map();
        this.waitQueue = new Map();
        // Initialize grid with cards face down and unclaimed
        this.grid = [];
        let cardIndex = 0;
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                const card = cards[cardIndex++];
                if (card === undefined) {
                    throw new Error(`Card at index ${cardIndex - 1} is undefined`);
                }
                row.push({
                    card,
                    faceUp: false,
                    controlledBy: null
                });
            }
            this.grid.push(row);
        }
        this.checkRep();
    }
    /**
     * Check the representation invariant.
     * @throws Error if the rep invariant is violated
     */
    checkRep() {
        assert(this.rows > 0, "rows must be > 0");
        assert(this.cols > 0, "cols must be > 0");
        assert(this.grid.length === this.rows, "grid length must equal rows");
        // Check grid dimensions and space invariants
        for (let r = 0; r < this.rows; r++) {
            const row = this.grid[r];
            assert(row !== undefined, `grid[${r}] must be defined`);
            assert(row.length === this.cols, `grid[${r}] length must equal cols`);
            for (let c = 0; c < this.cols; c++) {
                const row = this.grid[r];
                assert(row !== undefined, `grid[${r}] must be defined`);
                const space = row[c];
                assert(space !== undefined, `grid[${r}][${c}] must be defined`);
                // Empty spaces must be face down and not controlled
                if (space.card === null) {
                    assert(!space.faceUp, `empty space at (${r},${c}) cannot be face up`);
                    assert(space.controlledBy === null, `empty space at (${r},${c}) cannot be controlled`);
                }
                // Controlled cards must be face up
                if (space.controlledBy !== null) {
                    assert(space.faceUp, `controlled card at (${r},${c}) must be face up`);
                }
            }
        }
        // Check no two players control the same card
        const controlledPositions = new Set();
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const row = this.grid[r];
                assert(row !== undefined, `grid[${r}] must be defined`);
                const space = row[c];
                assert(space !== undefined, `grid[${r}][${c}] must be defined`);
                const controllerId = space.controlledBy;
                if (controllerId !== null) {
                    const key = `${r},${c}`;
                    assert(!controlledPositions.has(key), `multiple players control (${r},${c})`);
                    controlledPositions.add(key);
                }
            }
        }
        // Check player state consistency
        for (const [playerId, state] of this.players) {
            if (state.firstCard) {
                const { row, col } = state.firstCard;
                const rowData = this.grid[row];
                assert(rowData !== undefined, `grid[${row}] must be defined`);
                const space = rowData[col];
                assert(space !== undefined, `grid[${row}][${col}] must be defined`);
                assert(space.card !== null, `player ${playerId} first card at (${row},${col}) is empty`);
                // If matched, player controls both cards
                // If not matched and secondCard exists, player doesn't control either (rule 2-E)
                if (state.matched) {
                    assert(space.controlledBy === playerId, `player ${playerId} first matched card not controlled by them`);
                }
            }
            if (state.secondCard) {
                const { row, col } = state.secondCard;
                const rowData = this.grid[row];
                assert(rowData !== undefined, `grid[${row}] must be defined`);
                const space = rowData[col];
                assert(space !== undefined, `grid[${row}][${col}] must be defined`);
                assert(space.card !== null, `player ${playerId} second card at (${row},${col}) is empty`);
                // If matched, player controls both cards
                // If not matched, player doesn't control either card (rule 2-E)
                if (state.matched) {
                    assert(space.controlledBy === playerId, `player ${playerId} second matched card not controlled by them`);
                }
            }
        }
    }
    /**
     * Get the dimensions of the board.
     *
     * @returns the height and width of the board
     */
    getDimensions() {
        return { rows: this.rows, cols: this.cols };
    }
    /**
     * Look at the board from a player's perspective.
     *
     * @param playerId the player looking at the board
     * @returns string representation of board state in the format specified in PS4 handout:
     *   ROWSxCOLUMNS
     *   SPOT
     *   SPOT
     *   ...
     *   where SPOT is one of: "none", "down", "up CARD", "my CARD"
     */
    look(playerId) {
        let result = `${this.rows}x${this.cols}\n`;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const row = this.grid[r];
                assert(row !== undefined, `grid[${r}] must be defined`);
                const space = row[c];
                assert(space !== undefined, `grid[${r}][${c}] must be defined`);
                if (space.card === null) {
                    result += 'none\n';
                }
                else if (!space.faceUp) {
                    result += 'down\n';
                }
                else if (space.controlledBy === playerId) {
                    result += `my ${space.card}\n`;
                }
                else {
                    // Face up card controlled by someone else or no one
                    result += `up ${space.card}\n`;
                }
            }
        }
        return result;
    }
    /**
     * Helper to create position key for waitQueue.
     *
     * @param row - The row index of the position.
     * @param col - The column index of the position.
     * @returns A string key representing the position in the format "row,col".
     */
    posKey(row, col) {
        return `${row},${col}`;
    }
    /**
     * Flip a card at the given position.
     * Implements the complete game rules from PS4 handout.
     *
     * @param playerId ID of player making the flip
     * @param row row of card to flip, must be in [0, rows)
     * @param col column of card to flip, must be in [0, cols)
     * @returns promise that resolves when flip completes successfully
     * @throws Error if flip fails (no card at position, or attempting to flip
     *         a second card that's controlled by someone)
     */
    async flip(playerId, row, col) {
        assert(row >= 0 && row < this.rows, `row ${row} out of bounds`);
        assert(col >= 0 && col < this.cols, `col ${col} out of bounds`);
        // Get or create player state
        if (!this.players.has(playerId)) {
            this.players.set(playerId, {
                firstCard: null,
                secondCard: null,
                matched: false
            });
        }
        const playerState = this.players.get(playerId);
        assert(playerState !== undefined, `Player "${playerId}" must exist`);
        const rowData = this.grid[row];
        assert(rowData !== undefined, `grid[${row}] must be defined`);
        const space = rowData[col];
        assert(space !== undefined, `grid[${row}][${col}] must be defined`);
        // Determine if this is first or second card
        const isFirstCard = playerState.firstCard === null || playerState.secondCard !== null;
        // RULE 3: Before flipping a new first card, finish previous play
        if (isFirstCard) {
            await this.finishPreviousPlay(playerId, playerState);
        }
        if (isFirstCard) {
            await this.flipFirstCard(playerId, playerState, row, col, space);
        }
        else {
            await this.flipSecondCard(playerId, playerState, row, col, space);
        }
        this.checkRep();
    }
    /**
     * RULE 3: Finish previous play before starting new first card.
     *
     * @param playerId - The ID of the player attempting to flip a card.
     * @param playerState - The current state object associated with the player.
     */
    async finishPreviousPlay(playerId, playerState) {
        if (playerState.secondCard === null) {
            return; // No previous play to finish
        }
        const first = playerState.firstCard;
        const second = playerState.secondCard;
        if (playerState.matched) {
            // RULE 3-A: Remove matched cards
            if (first !== null) {
                this.removeCard(first.row, first.col, playerId);
            }
            if (second !== null) {
                this.removeCard(second.row, second.col, playerId);
            }
        }
        else {
            // RULE 3-B: Turn non-matching cards face down if not controlled
            if (first !== null) {
                this.turnDownIfNotControlled(first.row, first.col, playerId);
            }
            if (second !== null) {
                this.turnDownIfNotControlled(second.row, second.col, playerId);
            }
        }
        // Reset player state
        playerState.firstCard = null;
        playerState.secondCard = null;
        playerState.matched = false;
    }
    /**
     * Flip a first card (RULES 1-A through 1-D).
     *
     * @param playerId - The ID of the player attempting the flip.
     * @param playerState - The current state of the player.
     * @param row - The row index of the card to flip.
     * @param col - The column index of the card to flip.
     * @param space - The board space object at the specified position.
     */
    async flipFirstCard(playerId, playerState, row, col, space) {
        // RULE 1-A: No card there
        if (space.card === null) {
            throw new Error(`no card at (${row},${col})`);
        }
        // RULE 1-D: Card controlled by another player - WAIT
        while (space.controlledBy !== null && space.controlledBy !== playerId) {
            await this.waitForCard(row, col);
            // After waiting, check again (card might have been removed)
            if (space.card === null) {
                throw new Error(`no card at (${row},${col})`);
            }
        }
        // RULE 1-B and 1-C: Take control
        space.faceUp = true;
        space.controlledBy = playerId;
        playerState.firstCard = { row, col };
    }
    /**
     * Flip a second card (RULES 2-A through 2-D).
     *
     * @param playerId - The ID of the player attempting the flip.
     * @param playerState - The current state of the player.
     * @param row - The row index of the card to flip.
     * @param col - The column index of the card to flip.
     * @param space - The board space object at the specified position.
     */
    async flipSecondCard(playerId, playerState, row, col, space) {
        const first = playerState.firstCard;
        let firstSpace = undefined;
        if (first !== null) {
            const rowData = this.grid[first.row];
            assert(rowData !== undefined, `grid[${first.row}] must be defined`);
            firstSpace = rowData[first.col];
            assert(firstSpace !== undefined, `grid[${first.row}][${first.col}] must be defined`);
        }
        console.log(`DEBUG: Before checking second card, firstSpace.controlledBy = ${firstSpace?.controlledBy}`);
        // RULE 2-A: No card there
        if (space.card === null) {
            assert(firstSpace !== undefined, `firstSpace must be defined before relinquishing control`);
            firstSpace.controlledBy = null; // Relinquish first card
            if (first !== null) {
                this.notifyWaiters(first.row, first.col);
            }
            playerState.firstCard = null;
            throw new Error(`no card at (${row},${col})`);
        }
        // RULE 2-B: Card controlled by a player (to avoid deadlock, don't wait)
        if (space.controlledBy !== null) {
            assert(firstSpace !== undefined, `firstSpace must be defined before relinquishing control`);
            firstSpace.controlledBy = null; // Relinquish first card
            if (first !== null) {
                this.notifyWaiters(first.row, first.col);
            }
            playerState.firstCard = null;
            throw new Error(`card at (${row},${col}) is controlled by another player`);
        }
        console.log(`DEBUG: Before turning up second card, firstSpace.controlledBy = ${firstSpace?.controlledBy}`);
        // RULE 2-C: Turn face up if needed
        space.faceUp = true;
        console.log(`DEBUG: After turning up second card, firstSpace.controlledBy = ${firstSpace?.controlledBy}`);
        // RULE 2-D and 2-E: Check if cards match
        assert(firstSpace !== undefined, `firstSpace must be defined before checking match`);
        console.log(`DEBUG: firstSpace.card = '${firstSpace.card}', space.card = '${space.card}'`);
        if (firstSpace.card === space.card) {
            // Match! Keep control of both
            space.controlledBy = playerId;
            playerState.secondCard = { row, col };
            playerState.matched = true;
            console.log(`DEBUG: Match! Set second card control. firstSpace.controlledBy = ${firstSpace.controlledBy}`);
        }
        else {
            // RULE 2-E: No match - relinquish control of both cards but leave face up
            firstSpace.controlledBy = null;
            if (first !== null)
                this.notifyWaiters(first.row, first.col);
            // Don't take control of second card, just leave it face up
            playerState.secondCard = { row, col };
            playerState.firstCard = null;
            playerState.matched = false;
            console.log(`DEBUG: No match! Relinquished control.`);
        }
    }
    /**
     * Wait for a card to become available (not controlled by another player).
     *
     * @param row - The row index of the card to monitor.
     * @param col - The column index of the card to monitor.
     */
    async waitForCard(row, col) {
        const key = this.posKey(row, col);
        const { promise, resolve } = Promise.withResolvers();
        if (!this.waitQueue.has(key)) {
            this.waitQueue.set(key, []);
        }
        const queue = this.waitQueue.get(key);
        assert(queue !== undefined, `waitQueue entry for key "${key}" must be initialized`);
        queue.push(resolve);
        await promise;
    }
    /**
     * Remove a card from the board and notify waiters.
     *
     * @param row - The row index of the card to remove.
     * @param col - The column index of the card to remove.
     * @param playerId - The ID of the player who controlled the card.
     */
    removeCard(row, col, playerId) {
        const rowData = this.grid[row];
        assert(rowData !== undefined, `grid[${row}] must be defined`);
        const colData = rowData[col];
        assert(colData !== undefined, `grid[${row}][${col}] must be defined`);
        const space = colData;
        assert(space.controlledBy === playerId, 'can only remove cards you control');
        space.card = null;
        space.faceUp = false;
        space.controlledBy = null;
        this.notifyWaiters(row, col);
    }
    /**
     * Turn a card face down if it's not controlled by anyone.
     * RULE 3-B: Turn down cards that are face up and not controlled by another player.
     *
     * @param row - The row index of the card to turn down.
     * @param col - The column index of the card to turn down.
     * @param expectedController - The player who previously controlled this card
     */
    turnDownIfNotControlled(row, col, expectedController) {
        const rowData = this.grid[row];
        assert(rowData !== undefined, `grid[${row}] must be defined`);
        const space = rowData[col];
        assert(space !== undefined, `grid[${row}][${col}] must be defined`);
        // Only turn down if: card exists, is face up, and is NOT controlled by another player
        // (controlledBy is null or is still the expectedController)
        if (space.card !== null && space.faceUp && space.controlledBy === null) {
            space.faceUp = false;
            this.notifyWaiters(row, col);
        }
    }
    /**
     * Notify all players waiting for a specific card.
     *
     * @param row - The row index of the card being released.
     * @param col - The column index of the card being released.
     */
    notifyWaiters(row, col) {
        const key = this.posKey(row, col);
        const waiters = this.waitQueue.get(key);
        if (waiters) {
            // Notify all waiters
            for (const resolve of waiters) {
                resolve();
            }
            this.waitQueue.delete(key);
        }
    }
    /**
     * String representation of the board.
     * Shows all cards face up for debugging.
     *
     * @returns string representation
     */
    toString() {
        let result = `Board ${this.rows}x${this.cols}:\n`;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const row = this.grid[r];
                assert(row !== undefined, `grid[${r}] must be defined`);
                const col = row[c];
                assert(col !== undefined, `grid[${r}][${c}] must be defined`);
                const space = col;
                if (space.card === null) {
                    result += '[     ] ';
                }
                else {
                    const CONTROL_ID_LENGTH = 3;
                    const control = space.controlledBy !== null ? `@${space.controlledBy.substring(0, CONTROL_ID_LENGTH)}` : '    ';
                    const face = space.faceUp ? '↑' : '↓';
                    result += `[${space.card}${face}${control}] `;
                }
            }
            result += '\n';
        }
        return result;
    }
    /**
     * Make a new board by parsing a file.
     *
     * PS4 instructions: the specification of this method may not be changed.
     *
     * @param filename path to game board file
     * @returns a new board with the size and cards from the file
     * @throws Error if the file cannot be read or is not a valid game board
     */
    static async parseFromFile(filename) {
        const content = await fs.promises.readFile(filename, { encoding: 'utf-8' });
        const lines = content.split(/\r?\n/);
        // Parse first line: "ROWSxCOLUMNS"
        const firstLine = lines[0];
        assert(firstLine !== undefined, `grid[${0}] must be defined`);
        const match = firstLine.match(/^(\d+)x(\d+)$/);
        if (!match) {
            throw new Error(`Invalid board format: first line must be ROWSxCOLUMNS, got "${firstLine}"`);
        }
        if (match[1] === undefined || match[2] === undefined) {
            throw new Error(`Invalid board format: could not parse dimensions from "${firstLine}"`);
        }
        const rows = parseInt(match[1]);
        const cols = parseInt(match[2]);
        if (rows <= 0 || cols <= 0) {
            throw new Error(`Invalid dimensions: ${rows}x${cols}`);
        }
        // Parse card lines
        const cards = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            // Skip empty last line (common in text files)
            if (line === '' && i === lines.length - 1) {
                continue;
            }
            // Card must be non-empty and contain no whitespace or newlines
            if (line === undefined) {
                throw new Error(`Invalid card at line ${i + 1}: line is undefined`);
            }
            if (line === '' || /\s/.test(line)) {
                throw new Error(`Invalid card at line ${i + 1}: cards must be non-empty with no whitespace`);
            }
            cards.push(line);
        }
        if (cards.length !== rows * cols) {
            throw new Error(`Expected ${rows * cols} cards for ${rows}x${cols} board, got ${cards.length}`);
        }
        return new Board(rows, cols, cards);
    }
}
