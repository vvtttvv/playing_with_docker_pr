/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { Board } from '../src/board.js';


/**
 * Tests for the Board ADT.
 * 
 * Testing strategy:
 * 
 * parseFromFile():
 *   - valid files: small (1x1), medium (3x3), large (5x5)
 *   - invalid files: wrong card count, invalid dimensions, malformed
 * 
 * look():
 *   - empty board, board with cards
 *   - all cards face down
 *   - some cards face up (controlled by self, controlled by others, not controlled)
 *   - some spaces empty (after matches removed)
 * 
 * flip():
 *   - First card:
 *     - valid position, face down → turns face up, player controls it
 *     - valid position, face up, not controlled → player controls it  
 *     - valid position, face up, controlled by another player → waits
 *     - empty space → throws error
 *   - Second card:
 *     - match with first card → both stay face up, player keeps control
 *     - no match with first card → both stay face up, player relinquishes control
 *     - empty space → throws error, relinquishes first card
 *     - controlled by another player → throws error, relinquishes first card
 *   - Finishing previous play:
 *     - matched cards → removed from board
 *     - non-matching cards (not controlled) → turned face down
 *     - non-matching cards (now controlled by another) → stay face up
 * 
 * Concurrency:
 *   - multiple players flipping different cards simultaneously
 *   - multiple players waiting for same card
 *   - player makes move while another is waiting
 */

describe('Board', function() {
    
    // ========== parseFromFile() tests ==========
    
    describe('parseFromFile', function() {
        
        it('should parse a simple 1x1 board', async function() {
            const filename = 'test-boards/simple.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '1x1\nA\n');
            
            const board = await Board.parseFromFile(filename);
            const { rows, cols } = board.getDimensions();
            
            assert.strictEqual(rows, 1);
            assert.strictEqual(cols, 1);
            
            // Clean up
            await fs.promises.unlink(filename);
        });
        
        it('should parse a 3x3 board with emoji', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            const { rows, cols } = board.getDimensions();
            
            assert.strictEqual(rows, 3);
            assert.strictEqual(cols, 3);
        });
        
        it('should parse a 5x5 board', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');
            const { rows, cols } = board.getDimensions();
            
            assert.strictEqual(rows, 5);
            assert.strictEqual(cols, 5);
        });
        
        it('should reject file with wrong card count', async function() {
            const filename = 'test-boards/wrong-count.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nC\n'); // Only 3 cards for 2x2
            
            await assert.rejects(
                async () => await Board.parseFromFile(filename),
                /Expected 4 cards/
            );
            
            await fs.promises.unlink(filename);
        });
        
        it('should reject file with invalid dimensions', async function() {
            const filename = 'test-boards/bad-dims.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '0x0\n');
            
            await assert.rejects(
                async () => await Board.parseFromFile(filename),
                /Invalid dimensions/
            );
            
            await fs.promises.unlink(filename);
        });
        
        it('should reject file with malformed first line', async function() {
            const filename = 'test-boards/malformed.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, 'not-a-board\n');
            
            await assert.rejects(
                async () => await Board.parseFromFile(filename),
                /Invalid board format/
            );
            
            await fs.promises.unlink(filename);
        });
    });

    // ========== look() tests ==========
    
    describe('look', function() {
        
        it('should show all cards face down initially', async function() {
            const filename = 'test-boards/look1.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            const view = board.look('alice');
            
            const lines = view.split('\n');
            assert.strictEqual(lines[0], '2x2');
            assert.strictEqual(lines[1], 'down');
            assert.strictEqual(lines[2], 'down');
            assert.strictEqual(lines[3], 'down');
            assert.strictEqual(lines[4], 'down');
            
            await fs.promises.unlink(filename);
        });
        
        it('should show controlled cards as "my"', async function() {
            const filename = 'test-boards/look2.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice flips first card
            await board.flip('alice', 0, 0);
            
            const view = board.look('alice');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'my A');  // Alice's card
            
            await fs.promises.unlink(filename);
        });
        
        it('should show others\' controlled cards as "up"', async function() {
            const filename = 'test-boards/look3.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice flips first card
            await board.flip('alice', 0, 0);
            
            // Bob's view
            const view = board.look('bob');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'up A');  // Alice's card, from Bob's perspective
            
            await fs.promises.unlink(filename);
        });
        
        it('should show empty spaces as "none"', async function() {
            const filename = 'test-boards/look4.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice makes a match
            await board.flip('alice', 0, 0);  // First A
            await board.flip('alice', 1, 0);  // Second A
            
            // Start new move - matched cards removed
            await board.flip('alice', 0, 1);  // Some other card
            
            const view = board.look('alice');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'none');  // First A removed
            assert.strictEqual(lines[3], 'none');  // Second A removed
            
            await fs.promises.unlink(filename);
        });
    });

    // ========== flip() tests - First Card ==========
    
    describe('flip - first card', function() {
        
        it('should flip face-down card and give control', async function() {
            const filename = 'test-boards/flip1.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            await board.flip('alice', 0, 0);
            
            const view = board.look('alice');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'my A');
            
            await fs.promises.unlink(filename);
        });
        
        it('should give control of face-up uncontrolled card', async function() {
            const filename = 'test-boards/flip2.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice flips and doesn't match
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1);  // No match - cards stay up but not controlled
            
            // Bob can now take control of the face-up card
            await board.flip('bob', 0, 0);
            
            const view = board.look('bob');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'my A');
            
            await fs.promises.unlink(filename);
        });
        
        it('should throw error for empty space', async function() {
            const filename = 'test-boards/flip3.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice makes a match and removes cards
            await board.flip('alice', 0, 0);
            await board.flip('alice', 1, 0);
            await board.flip('alice', 0, 1);  // Removes matched As
            
            // Bob tries to flip empty space
            await assert.rejects(
                async () => await board.flip('bob', 0, 0),
                /no card at/
            );
            
            await fs.promises.unlink(filename);
        });
        
        it('should wait for controlled card', async function() {
            const filename = 'test-boards/flip4.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice flips first card
            await board.flip('alice', 0, 0);
            
            // Bob tries to flip same card - should wait
            let bobDone = false;
            const bobPromise = board.flip('bob', 0, 0).then(() => {
                bobDone = true;
            });
            
            // Give Bob a moment to start waiting
            await timeout(10);
            assert.strictEqual(bobDone, false, 'Bob should still be waiting');
            
            // Alice flips second card (no match) - relinquishes first card
            await board.flip('alice', 0, 1);
            
            // Now Bob's flip should complete
            await bobPromise;
            assert.strictEqual(bobDone, true);
            
            await fs.promises.unlink(filename);
        });
    });

    // ========== flip() tests - Second Card ==========
    
    describe('flip - second card', function() {
        
        it('should match and keep control of both cards', async function() {
            const filename = 'test-boards/flip-2nd-1.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            await board.flip('alice', 0, 0);  // First A
            await board.flip('alice', 1, 0);  // Second A - match!
            
            const view = board.look('alice');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'my A');  // First card
            assert.strictEqual(lines[3], 'my A');  // Second card
            
            await fs.promises.unlink(filename);
        });
        
        it('should not match and relinquish control', async function() {
            const filename = 'test-boards/flip-2nd-2.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            await board.flip('alice', 0, 0);  // A
            await board.flip('alice', 0, 1);  // B - no match
            
            const view = board.look('alice');
            const lines = view.split('\n');
            // Both cards face up but not controlled
            assert.strictEqual(lines[1], 'up A');
            assert.strictEqual(lines[2], 'up B');
            
            await fs.promises.unlink(filename);
        });
        
        it('should throw and relinquish first card on empty space', async function() {
            const filename = 'test-boards/flip-2nd-3.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '3x3\nA\nB\nA\nB\nC\nC\nD\nD\nE\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Bob makes a match and removes cards
            await board.flip('bob', 0, 0);  // First A at (0,0)
            await board.flip('bob', 0, 2);  // Second A at (0,2) - match!
            await board.flip('bob', 0, 1);  // Removes the As
            
            // Alice tries second card at empty space
            await board.flip('alice', 1, 0);  // First card - B at (1,0)
            
            await assert.rejects(
                async () => await board.flip('alice', 0, 0),  // Empty! (A was removed)
                /no card at/
            );
            
            // Alice's first card should be relinquished
            const view = board.look('alice');
            const lines = view.split('\n');
            assert.strictEqual(lines[4], 'up B');  // Position (1,0) - not "my" anymore
            
            await fs.promises.unlink(filename);
        });
        
        it('should throw and relinquish on controlled card', async function() {
            const filename = 'test-boards/flip-2nd-4.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Bob flips first card
            await board.flip('bob', 0, 1);
            
            // Alice tries to flip two cards, but second is controlled by Bob
            await board.flip('alice', 0, 0);
            
            await assert.rejects(
                async () => await board.flip('alice', 0, 1),  // Controlled by Bob
                /controlled by another player/
            );
            
            // Alice's first card should be relinquished
            const view = board.look('alice');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'up A');  // Not "my" anymore
            
            await fs.promises.unlink(filename);
        });
    });

    // ========== flip() tests - Finishing Previous Play ==========
    
    describe('flip - finishing previous play', function() {
        
        it('should remove matched cards on next move', async function() {
            const filename = 'test-boards/finish1.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '3x3\nA\nB\nA\nB\nC\nC\nD\nD\nE\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice matches A cards at (0,0) and (0,2)
            await board.flip('alice', 0, 0);  // First A at (0,0)
            await board.flip('alice', 0, 2);  // Second A at (0,2) - match!
            
            // Alice starts new move - should remove As
            await board.flip('alice', 0, 1);
            
            const view = board.look('alice');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'none');  // Position (0,0) - First A removed
            assert.strictEqual(lines[3], 'none');  // Position (0,2) - Second A removed
            
            await fs.promises.unlink(filename);
        });
        
        it('should turn down non-matching uncontrolled cards', async function() {
            const filename = 'test-boards/finish2.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice flips non-matching cards
            // Board is: A B / A B (row-major)
            //           (0,0) (0,1) / (1,0) (1,1)
            await board.flip('alice', 0, 0);  // A at (0,0)
            await board.flip('alice', 0, 1);  // B at (0,1) - no match
            
            // Alice starts new move - should turn them down
            await board.flip('alice', 1, 0);  // A at (1,0)
            
            const view = board.look('alice');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'down');  // Position (0,0) - turned down
            assert.strictEqual(lines[2], 'down');  // Position (0,1) - turned down
            
            await fs.promises.unlink(filename);
        });
        
        it('should NOT turn down card now controlled by another', async function() {
            const filename = 'test-boards/finish3.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice flips non-matching cards
            await board.flip('alice', 0, 0);  // A
            await board.flip('alice', 0, 1);  // B - no match, relinquishes
            
            // Bob takes control of one of Alice's cards
            await board.flip('bob', 0, 0);
            
            // Alice starts new move
            await board.flip('alice', 1, 0);
            
            const view = board.look('bob');
            const lines = view.split('\n');
            assert.strictEqual(lines[1], 'my A');  // Bob's card stays up
            assert.strictEqual(lines[2], 'down');  // Alice's other card turned down
            
            await fs.promises.unlink(filename);
        });
    });

    // ========== Concurrency tests ==========
    
    describe('concurrency', function() {
        
        it('should handle multiple players flipping different cards', async function() {
            const filename = 'test-boards/concurrent1.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '3x3\nA\nB\nC\nA\nB\nC\nD\nD\nE\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice and Bob flip simultaneously
            await Promise.all([
                board.flip('alice', 0, 0),
                board.flip('bob', 0, 1)
            ]);
            
            const aliceView = board.look('alice');
            const bobView = board.look('bob');
            
            const aliceLines = aliceView.split('\n');
            const bobLines = bobView.split('\n');
            
            assert.strictEqual(aliceLines[1], 'my A');
            assert.strictEqual(bobLines[2], 'my B');
            
            await fs.promises.unlink(filename);
        });
        
        it('should handle multiple waiters for same card', async function() {
            const filename = 'test-boards/concurrent2.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '2x2\nA\nB\nA\nB\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice controls a card
            await board.flip('alice', 0, 0);
            
            // Bob and Charlie both wait for it
            const bobPromise = board.flip('bob', 0, 0);
            const charliePromise = board.flip('charlie', 0, 0);
            
            await timeout(10);  // Let them start waiting
            
            // Alice releases the card
            await board.flip('alice', 0, 1);  // No match, relinquishes
            
            // One of them should get it (but not both)
            await Promise.race([bobPromise, charliePromise]);
            
            await fs.promises.unlink(filename);
        });
        
        it('should handle player making move while another waits', async function() {
            const filename = 'test-boards/concurrent3.txt';
            await fs.promises.mkdir('test-boards', { recursive: true });
            await fs.promises.writeFile(filename, '3x3\nA\nB\nC\nA\nB\nC\nD\nD\nE\n');
            
            const board = await Board.parseFromFile(filename);
            
            // Alice controls a card
            await board.flip('alice', 0, 0);
            
            // Bob waits for it
            const bobPromise = board.flip('bob', 0, 0);
            
            await timeout(10);
            
            // Charlie makes a completely different move
            await board.flip('charlie', 1, 1);
            await board.flip('charlie', 1, 2);  // Should work fine
            
            // Alice releases, Bob gets it
            await board.flip('alice', 0, 1);
            await bobPromise;
            
            const bobView = board.look('bob');
            assert(bobView.includes('my A'));
            
            await fs.promises.unlink(filename);
        });
    });
    
    // Cleanup test-boards directory after all tests
    after(async function() {
        try {
            const files = await fs.promises.readdir('test-boards');
            for (const file of files) {
                await fs.promises.unlink(`test-boards/${file}`);
            }
            await fs.promises.rmdir('test-boards');
        } catch (err) {
            // Directory might not exist, that's okay
        }
    });


});


/**
 * Example test case that uses async/await to test an asynchronous function.
 * Feel free to delete these example tests.
 */
describe('async test cases', function() {

    it('reads a file asynchronously', async function() {
        const fileContents = (await fs.promises.readFile('boards/ab.txt')).toString();
        assert(fileContents.startsWith('5x5'));
    });
});

/**
 * Helper function to create a delay
 * @param ms milliseconds to wait
 */
async function timeout(ms: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    return promise;
}
