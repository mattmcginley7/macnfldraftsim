const apiUrl = "http://localhost:5000";


// Complete list of NFL teams
const nflTeams = [
    "Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens", "Buffalo Bills",
    "Carolina Panthers", "Chicago Bears", "Cincinnati Bengals", "Cleveland Browns",
    "Dallas Cowboys", "Denver Broncos", "Detroit Lions", "Green Bay Packers",
    "Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Kansas City Chiefs",
    "Las Vegas Raiders", "Los Angeles Chargers", "Los Angeles Rams", "Miami Dolphins",
    "Minnesota Vikings", "New England Patriots", "New Orleans Saints", "New York Giants",
    "New York Jets", "Philadelphia Eagles", "Pittsburgh Steelers", "San Francisco 49ers",
    "Seattle Seahawks", "Tampa Bay Buccaneers", "Tennessee Titans", "Washington Commanders"
];

// Function to populate team selection dropdown
function populateTeamSelection() {
    const teamSelect = document.getElementById("teamSelect");
    nflTeams.forEach(team => {
        let option = document.createElement("option");
        option.value = team;
        option.textContent = team;
        teamSelect.appendChild(option);
    });
}

// Function to fetch and display available players
function fetchPlayers() {
    fetch(`${apiUrl}/api/players`)
        .then(response => response.json())
        .then(players => {
            const playerSelect = document.getElementById('playerSelect');
            playerSelect.innerHTML = ''; // Clear existing options
            players.forEach(player => {
                let option = document.createElement('option');
                option.value = player.name;
                option.textContent = `${player.name} - ${player.position}`;
                playerSelect.appendChild(option);
            });
        })
        .catch(error => console.error('Error fetching players:', error));
}

// Function to handle player selection, assuming you have some way to capture which player and team was selected
function handlePlayerSelection(playerName, teamName) {
    fetch(`${apiUrl}/api/selectPlayer`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ player: playerName, team: teamName })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log(data.message); // Log the response message
            fetchPlayers(); // Refresh the list of available players
        })
        .catch(error => console.error('Failed to select player:', error));
}

// Ensure fetchPlayers is called when the document is loaded to populate the initial list of players
document.addEventListener('DOMContentLoaded', function () {
    fetchPlayers();
});

// Function to start the draft
function startDraft() {
    fetch(`${apiUrl}/api/startDraft`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log(data.message); // Log the start draft message

            // Disable the start draft button to prevent restarting the draft mid-way
            document.getElementById('startDraft').disabled = true;

            // Enable the select player button, allowing the user to make their first pick
            document.getElementById('selectPlayer').disabled = false;

            // Ensure the next round button is disabled at the start; it will be enabled after a selection is made
            document.getElementById('nextRound').disabled = true;

            // The finish draft button should initially be disabled and only enabled in the last round of the draft
            document.getElementById('finishDraft').disabled = true;

            // If there are additional UI updates needed, such as displaying the current round or clearing previous draft results, handle them here
            document.getElementById('draftResults').innerHTML = `Draft started - Round 1`;

            // Refresh the list of available players to ensure it's up-to-date at the start of the draft
            fetchPlayers();
        })
        .catch(error => {
            console.error('Error starting draft:', error);
            // If starting the draft fails, re-enable the start draft button to allow retrying
            document.getElementById('startDraft').disabled = false;
        });
}
