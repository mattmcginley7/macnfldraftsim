const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const playersFilePath = path.join(__dirname, 'players.json');
const teamsFilePath = path.join(__dirname, 'teams.json');

// MongoDB connection setup
const uri = process.env.MONGODB_URI; // Ensure this is set in your environment variables
const client = new MongoClient(uri);


let draftStateCollection;

async function connectToDB() {
    try {
        await client.connect();
        const database = client.db('draft_db'); // Use your database name
        draftStateCollection = database.collection('draft_state');
        console.log('Connected to MongoDB database');
    } catch (error) {
        console.error('Error connecting to database:', error);
    }
}

// Call the function to connect to the database
connectToDB();

// Function to initialize draft state
const initializeDraftState = () => {
    try {
        const players = JSON.parse(fs.readFileSync(playersFilePath, 'utf-8'));
        const teams = JSON.parse(fs.readFileSync(teamsFilePath, 'utf-8')).teams;

        return {
            currentRound: 1,
            totalRounds: 7,
            draftHistory: [],
            teamPicks: teams.reduce((acc, team) => {
                acc[team.name] = team.picks.map(pick => ({ ...pick, player: null }));
                return acc;
            }, {}),
            availablePlayers: players
            // Note: version field is not included in draftState object itself
        };
    } catch (error) {
        console.error("Error initializing draft state:", error);
        throw error;
    }
};

// Endpoint to get teams
app.get('/api/teams', (req, res) => {
    const teams = JSON.parse(fs.readFileSync(teamsFilePath, 'utf-8')).teams;
    res.json(teams);
});

// Endpoint to get players
app.get('/api/players', async (req, res) => {
    try {
        // Load draftState from database
        const draftStateDoc = await draftStateCollection.findOne({ _id: 'draftState' });
        if (!draftStateDoc) {
            return res.status(500).json({ message: 'Draft state not found' });
        }
        const draftState = draftStateDoc.state;
        res.json(draftState.availablePlayers);
    } catch (error) {
        console.error('Error in GET /api/players:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// Endpoint to get draft history
app.get('/api/draftHistory', async (req, res) => {
    try {
        // Load draftState from database
        const draftStateDoc = await draftStateCollection.findOne({ _id: 'draftState' });
        if (!draftStateDoc) {
            return res.status(500).json({ message: 'Draft state not found' });
        }
        const draftState = draftStateDoc.state;
        res.json(draftState.draftHistory);
    } catch (error) {
        console.error('Error in GET /api/draftHistory:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Endpoint to get draft state
app.get('/api/draftState', async (req, res) => {
    try {
        // Load draftState from database
        const draftStateDoc = await draftStateCollection.findOne({ _id: 'draftState' });
        if (!draftStateDoc) {
            return res.status(500).json({ message: 'Draft state not found' });
        }
        const draftState = draftStateDoc.state;
        res.json(draftState);
    } catch (error) {
        console.error('Error in GET /api/draftState:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// Endpoint to start the draft
app.post('/api/startDraft', async (req, res) => {
    try {
        const { teamId } = req.body;
        if (!teamId) return res.status(400).json({ message: 'Team ID is required' });

        // Reset draft state
        const draftState = initializeDraftState();

        // Save draftState to database with version
        await draftStateCollection.updateOne(
            { _id: 'draftState' },
            { $set: { state: draftState, version: 1 } },
            { upsert: true }
        );

        console.log("Draft state after reset:", draftState);

        res.json({
            message: 'Draft started',
            currentRound: draftState.currentRound,
            teamPicks: draftState.teamPicks[teamId],
            availablePlayers: draftState.availablePlayers
        });
    } catch (error) {
        console.error('Error in POST /api/startDraft:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// Function to get round from pick number
function getRoundFromPick(pick) {
    if (pick >= 1 && pick <= 32) return 1;
    if (pick >= 33 && pick <= 64) return 2;
    if (pick >= 65 && pick <= 100) return 3;
    if (pick >= 101 && pick <= 135) return 4;
    if (pick >= 136 && pick <= 176) return 5;
    if (pick >= 177 && pick <= 220) return 6;
    if (pick >= 221 && pick <= 257) return 7;
    return -1; // Invalid pick number
}

// Endpoint to simulate draft
app.post('/api/simulateDraft', async (req, res) => {
    try {
        const { userTeam } = req.body;

        // Load draftState from database
        const draftStateDoc = await draftStateCollection.findOne({ _id: 'draftState' });
        if (!draftStateDoc) {
            return res.status(500).json({ message: 'Draft state not found' });
        }
        const draftState = draftStateDoc.state;

        const draftSequence = generateDraftSequence(draftState, userTeam);

        res.json({
            message: 'Draft simulation sequence generated',
            draftSequence
        });
    } catch (error) {
        console.error('Error in POST /api/simulateDraft:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// Function to generate draft sequence
function generateDraftSequence(state, userTeam) {
    const sequence = [];
    const picks = [];

    for (const [team, teamPicks] of Object.entries(state.teamPicks)) {
        teamPicks.forEach(pick => {
            picks.push({
                pick: pick.pick,
                team,
                user: team === userTeam,
                round: getRoundFromPick(pick.pick),
                value: pick.value
            });
        });
    }

    // Sort picks in numerical order to maintain the correct sequence
    picks.sort((a, b) => a.pick - b.pick);

    return picks;
}

// Endpoint to simulate a draft pick
app.post('/api/simulateDraftPick', async (req, res) => {
    try {
        const { team, round } = req.body;

        // Implement retry logic for conflict resolution
        let updated = false;
        const maxRetries = 5;
        let retries = 0;

        while (!updated && retries < maxRetries) {
            // Load draftState from database
            const draftStateDoc = await draftStateCollection.findOne({ _id: 'draftState' });
            if (!draftStateDoc) {
                return res.status(500).json({ message: 'Draft state not found' });
            }
            let draftState = draftStateDoc.state;
            let version = draftStateDoc.version || 0;

            // Simulate the draft pick
            simulateDraftPick(draftState, team, round);

            // Attempt to atomically update the draftState in the database
            const result = await draftStateCollection.findOneAndUpdate(
                { _id: 'draftState', version },
                {
                    $set: { state: draftState },
                    $inc: { version: 1 }
                },
                { returnDocument: 'after' } // Use 'after' to get the updated document
            );

            if (result.value) {
                // Update was successful
                updated = true;
                res.json({
                    message: `Simulated draft pick for ${team}`,
                    draftHistory: draftState.draftHistory,
                    availablePlayers: draftState.availablePlayers
                });
                return; // Ensure we return after sending the response
            } else {
                // Version mismatch, another operation updated the draftState
                retries++;
                console.warn(`Version mismatch detected in simulateDraftPick, retrying (${retries}/${maxRetries})...`);
                // No need to manually reload draftStateDoc here, since it's reloaded at the start of the loop
            }
        }

        if (!updated) {
            console.error('Failed to update draftState after maximum retries in simulateDraftPick');
            return res.status(500).json({ message: 'Failed to update draft state, please try again' });
        }
    } catch (error) {
        console.error('Error in POST /api/simulateDraftPick:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});




// Function to simulate a draft pick
function simulateDraftPick(draftState, team, round) {
    if (draftState.availablePlayers.length === 0) {
        console.error('No available players to pick');
        return;
    }

    const selectedPlayer = getRandomPlayerWithBias(draftState.availablePlayers, round);
    const pickIndex = draftState.teamPicks[team].findIndex(pick => pick.player === null);

    if (!selectedPlayer) {
        console.error('Selected player is undefined');
        return;
    }

    if (pickIndex !== -1) {
        draftState.teamPicks[team][pickIndex].player = selectedPlayer;
        draftState.draftHistory.push({
            pick: draftState.teamPicks[team][pickIndex].pick,
            team,
            player: selectedPlayer.name,
            position: selectedPlayer.position,
            college: selectedPlayer.team,
            teamLogo: `./${team.toLowerCase().replace(/\s/g, '-')}-logo.png`
        });
        console.log(`Player ${selectedPlayer.name} selected by ${team} at pick ${draftState.teamPicks[team][pickIndex].pick}`);
    } else {
        console.error(`No available pick slot for ${team} in round ${round}`);
    }
}

// Function to get a random player with bias based on round
function getRandomPlayerWithBias(availablePlayers, round) {
    const biasRange = [10, 20, 30, 35, 35, 35, 35]; // Bias ranges for rounds 1-7
    const range = biasRange[round - 1];
    const eligiblePlayers = availablePlayers.slice(0, Math.min(range, availablePlayers.length));
    const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
    return availablePlayers.splice(availablePlayers.indexOf(eligiblePlayers[randomIndex]), 1)[0];
}

// Endpoint to select a player
app.post('/api/selectPlayer', async (req, res) => {
    try {
        const { player, team } = req.body;
        console.log(`Request to select player: ${player} for team: ${team}`);

        let updated = false;
        const maxRetries = 5;
        let retries = 0;

        while (!updated && retries < maxRetries) {
            // Load draftState and its version from the database
            const draftStateDoc = await draftStateCollection.findOne({ _id: 'draftState' });
            if (!draftStateDoc) {
                console.error('Draft state not found in database');
                return res.status(500).json({ message: 'Draft state not found' });
            }

            let draftState = draftStateDoc.state;
            let version = draftStateDoc.version || 0;

            if (!draftState.teamPicks[team]) {
                console.error('Invalid team name:', team);
                return res.status(400).json({ message: 'Invalid team name' });
            }

            const playerIndex = draftState.availablePlayers.findIndex(p => p.name === player);
            if (playerIndex === -1) {
                console.error('Player not found or already drafted');
                return res.status(400).json({ message: 'Player not found or already drafted' });
            }

            const selectedPlayer = draftState.availablePlayers.splice(playerIndex, 1)[0];
            const pickIndex = draftState.teamPicks[team].findIndex(pick => pick.player === null);

            if (pickIndex !== -1) {
                draftState.teamPicks[team][pickIndex].player = selectedPlayer;
                draftState.draftHistory.push({
                    pick: draftState.teamPicks[team][pickIndex].pick,
                    team,
                    player: selectedPlayer.name,
                    position: selectedPlayer.position,
                    college: selectedPlayer.team,
                    teamLogo: `./${team.toLowerCase().replace(/\s/g, '-')}-logo.png`
                });

                console.log(`Player ${selectedPlayer.name} selected by ${team}`);

                // Attempt to atomically update the draftState in the database
                const result = await draftStateCollection.findOneAndUpdate(
                    { _id: 'draftState', version },
                    {
                        $set: { state: draftState },
                        $inc: { version: 1 }
                    },
                    { returnDocument: 'after' }
                );

                if (result.value) {
                    // Update was successful
                    updated = true;
                    res.json({
                        message: `${team} selects ${selectedPlayer.name}`,
                        selectedPlayer,
                        draftHistory: draftState.draftHistory
                    });
                    return; // Ensure we return after sending the response
                } else {
                    // Version mismatch, another operation updated the draftState
                    retries++;
                    console.warn(`Version mismatch detected in selectPlayer, retrying (${retries}/${maxRetries})...`);
                }
            } else {
                console.error('No available picks for the team');
                return res.status(400).json({ message: 'No available picks for the team' });
            }
        }

        if (!updated) {
            console.error('Failed to update draftState after maximum retries in selectPlayer');
            return res.status(500).json({ message: 'Failed to update draft state, please try again' });
        }
    } catch (error) {
        console.error('Error in POST /api/selectPlayer:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});



// Endpoint to make a trade
app.post('/api/makeTrade', async (req, res) => {
    try {
        const { offer, userTeam, currentRound } = req.body;
        console.log('Received trade offer:', offer);

        if (!offer) {
            return res.status(400).json({ message: 'Invalid trade offer' });
        }

        let updated = false;
        const maxRetries = 5;
        let retries = 0;

        while (!updated && retries < maxRetries) {
            // Load draftState and its version from the database
            const draftStateDoc = await draftStateCollection.findOne({ _id: 'draftState' });
            if (!draftStateDoc) {
                console.error('Draft state not found in database');
                return res.status(500).json({ message: 'Draft state not found' });
            }

            let draftState = draftStateDoc.state;
            let version = draftStateDoc.version || 0;

            const { fromTeam, fromPicks, toTeam, toPick } = offer;

            try {
                // Update the draft state
                draftState = updateDraftState(draftState, fromTeam, fromPicks, toTeam, toPick);

                // Attempt to atomically update the draftState in the database
                const result = await draftStateCollection.findOneAndUpdate(
                    { _id: 'draftState', version },
                    {
                        $set: { state: draftState },
                        $inc: { version: 1 }
                    },
                    { returnDocument: 'after' }
                );

                if (result.value) {
                    // Update was successful
                    updated = true;

                    // Regenerate the draft sequence based on the updated draft state
                    const draftSequence = generateDraftSequence(draftState, userTeam);

                    // Filter out picks that have already been made
                    const currentDraftPick = draftState.draftHistory.length
                        ? draftState.draftHistory[draftState.draftHistory.length - 1].pick
                        : 0;
                    const filteredDraftSequence = draftSequence.filter(pick => pick.pick > currentDraftPick);

                    res.json({
                        message: 'Trade accepted',
                        draftState,
                        draftSequence: filteredDraftSequence,
                        currentRound
                    });
                    return; // Ensure we return after sending the response
                } else {
                    // Version mismatch, another operation updated the draftState
                    retries++;
                    console.warn(`Version mismatch detected in makeTrade, retrying (${retries}/${maxRetries})...`);
                }
            } catch (error) {
                console.error('Error processing trade:', error);
                return res.status(500).json({ message: 'Error processing trade', error: error.message });
            }
        }

        if (!updated) {
            console.error('Failed to update draftState after maximum retries in makeTrade');
            return res.status(500).json({ message: 'Failed to update draft state, please try again' });
        }
    } catch (error) {
        console.error('Error in POST /api/makeTrade:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});



// Function to update draft state after a trade
function updateDraftState(state, fromTeam, fromPicks, toTeam, toPick) {
    const newState = JSON.parse(JSON.stringify(state)); // Deep copy

    // Remove toPick from toTeam's picks and add it to fromTeam
    newState.teamPicks[toTeam] = newState.teamPicks[toTeam].filter(pick => pick.pick !== toPick.pick);
    newState.teamPicks[fromTeam].push({ ...toPick, player: null });

    // Remove fromPicks from fromTeam's picks and add them to toTeam
    fromPicks.forEach(pick => {
        newState.teamPicks[fromTeam] = newState.teamPicks[fromTeam].filter(p => p.pick !== pick.pick);
        newState.teamPicks[toTeam].push({ ...pick, player: null });
    });

    // Sort picks for both teams
    newState.teamPicks[fromTeam].sort((a, b) => a.pick - b.pick);
    newState.teamPicks[toTeam].sort((a, b) => a.pick - b.pick);

    return newState;
}

// 404 Error Handler
app.use((req, res) => {
    res.status(404).json({ message: 'Endpoint not found' });
});

// General Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));


