let currentRound = 1;
const totalRounds = 7;
let draftSequence = [];
let draftInterval;
let userTeam;
let allPlayers = [];
let draftState = { teamPicks: {} };
let tradeOffers = [];
let currentOfferIndex = 0;
let teamsData = {};


const apiUrl = "http://localhost:5000"

// Function to load teams data
async function loadTeamsData() {
    try {
        const response = await fetch(`${apiUrl}/api/teams`);
        teamsData = await response.json();
        console.log('Teams data loaded:', teamsData);
    } catch (error) {
        console.error('Error loading teams data:', error);
    }
}

// Function to fetch draft state
function fetchDraftState() {
    return fetch(`${apiUrl}/api/draftState`)
        .then(response => response.json())
        .then(data => {
            draftState = data;
            console.log('Draft state fetched:', draftState);
        })
        .catch(error => console.error('Error fetching draft state:', error));
}

// Function to fetch players
function fetchPlayers() {
    fetch(`${apiUrl}/api/players`)
        .then(response => response.json())
        .then(players => {
            allPlayers = players;
            populatePlayerDropdown(players);
        })
        .catch(error => console.error('Error fetching players:', error));
}

// Function to populate player dropdown
function populatePlayerDropdown(players) {
    const playerSelect = document.getElementById('playerSelect');
    playerSelect.innerHTML = '';
    players.forEach((player) => {
        let option = document.createElement('option');
        option.value = player.name;
        option.textContent = `${player.rating}. ${player.name} - ${player.position}`;
        playerSelect.appendChild(option);
    });
    document.getElementById('selectPlayer').disabled = true;
}

function startDraft() {
    return fetch(`${apiUrl}/api/startDraft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: userTeam })
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.message);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log(data.message); // "Draft started"
            // Handle any additional data if necessary
        })
        .catch(error => {
            console.error('Error starting draft:', error);
            alert('Error starting draft: ' + error.message);
        });
}


// Function to filter players
function filterPlayers(criteria) {
    let filteredPlayers = allPlayers;
    if (criteria === 'offense') {
        filteredPlayers = allPlayers.filter(player => ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL'].includes(player.position));
    } else if (criteria === 'defense') {
        filteredPlayers = allPlayers.filter(player => ['EDGE', 'DL', 'LB', 'CB', 'S'].includes(player.position));
    } else if (criteria !== 'all') {
        filteredPlayers = allPlayers.filter(player => player.position === criteria);
    }
    populatePlayerDropdown(filteredPlayers);
    document.getElementById('selectPlayer').disabled = false; // Ensure the button is enabled after filtering
}


// Function to update draft history
function updateDraftHistory(draftHistory) {
    const draftHistoryContainer = document.getElementById('draftHistory');
    draftHistoryContainer.innerHTML = '';
    (draftHistory || []).forEach(pick => {
        const teamLogo = `../images/${pick.team.toLowerCase().replace(/\s/g, '-')}-logo.png`;
        const pickElement = document.createElement('div');
        pickElement.className = 'draft-pick-item';
        pickElement.innerHTML = `
           <img src="${teamLogo}" alt="${pick.team} Logo" class="team-logo-small">
           <strong>${pick.pick}. ${pick.player}</strong>, ${pick.position}, ${pick.college}`;
        draftHistoryContainer.appendChild(pickElement);
    });
}

// Function to simulate a draft pick
async function simulateDraftPick(team, round) {
    try {
        const response = await fetch(`${apiUrl}/api/simulateDraftPick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team, round })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Server error');
        }

        const data = await response.json();
        updateDraftHistory(data.draftHistory);
        await fetchPlayers();

        if (draftSequence.length > 0) {
            draftInterval = setTimeout(processDraftSequence, 500);
        }

        checkRoundEnd();
    } catch (error) {
        console.error('Error simulating draft pick:', error);
        alert(`Error simulating draft pick: ${error.message}`);
    }
}




// Function to process the draft sequence
function processDraftSequence() {
    if (!draftSequence || draftSequence.length === 0) {
        console.log("Draft sequence is empty or not defined. Ending draft.");
        clearTimeout(draftInterval);
        showResultsModal();
        return;
    }

    const { team, round, user, pick } = draftSequence.shift();

    if (round !== currentRound) {
        currentRound = round;
    }

    if (user) {
        clearTimeout(draftInterval);
        document.getElementById('selectPlayer').disabled = false;

        tradeOffers = generateTradeOffers(pick, round);
        if (tradeOffers.length > 0) {
            showTradeOffersModal(tradeOffers);
        }
        return;
    }

    simulateDraftPick(team, currentRound);
}


// Function to generate trade offers
function generateTradeOffers(userPick, currentRound) {
    if (!draftState || !draftState.teamPicks) {
        console.error('Draft state not available');
        return [];
    }

    const maxOffersPerRound = [3, 2, 2, 2, 1, 1, 1];
    const maxOffers = maxOffersPerRound[currentRound - 1];

    const userPickValue = draftState.teamPicks[userTeam]?.find(pick => pick.pick === userPick)?.value || 0;

    const eligibleTeams = Object.keys(draftState.teamPicks).filter(team => team !== userTeam);
    const offers = [];

    const shuffledTeams = eligibleTeams.sort(() => 0.5 - Math.random()); // Shuffle teams for randomness

    for (const team of shuffledTeams) {
        if (offers.length >= maxOffers) break;

        const teamPicks = draftState.teamPicks[team];
        const laterPicks = teamPicks.filter(pick => pick.pick > userPick && pick.player === null);

        if (laterPicks.length >= 2) {
            const mainPick = laterPicks[0];
            const compensationPicks = laterPicks.slice(1, 4); // Limit to at most 3 additional picks

            let totalOfferValue = mainPick.value;
            const additionalPicks = [];

            for (const pick of compensationPicks) {
                if (totalOfferValue < userPickValue * 0.95) {
                    totalOfferValue += pick.value;
                    additionalPicks.push(pick);
                } else {
                    break;
                }
            }

            // Ensure the offer value is closer to the user's pick value in the first three rounds
            if (additionalPicks.length + 1 >= 2 && additionalPicks.length + 1 <= 4) {
                if (currentRound <= 3 && totalOfferValue >= userPickValue * 0.9 && totalOfferValue <= userPickValue * 1.1) {
                    offers.push({
                        fromTeam: team,
                        fromPicks: [mainPick, ...additionalPicks],
                        toTeam: userTeam,
                        toPick: { pick: userPick, value: userPickValue },
                    });
                } else if (currentRound > 3 && totalOfferValue >= userPickValue * 0.95) {
                    offers.push({
                        fromTeam: team,
                        fromPicks: [mainPick, ...additionalPicks],
                        toTeam: userTeam,
                        toPick: { pick: userPick, value: userPickValue },
                    });
                }
            }
        }
    }

    console.log(`Generated trade offers:`, offers);
    return offers.slice(0, maxOffers);
}



// Function to execute a trade
function executeTrade(draftOrder, currentTeam, offerTeam, offeredPicks, receivedPicks) {
    // Remove the current team's pick from the draft order
    receivedPicks.forEach(pick => {
        draftOrder[pick] = offerTeam;
    });

    // Add the offer team's picks to the draft order
    offeredPicks.forEach(pick => {
        draftOrder[pick] = currentTeam;
    });

    return draftOrder;
}

// Function to display the current offer
function displayCurrentOffer() {
    if (tradeOffers.length === 0) {
        console.error("No trade offers available!");
        return;
    }

    const offer = tradeOffers[currentOfferIndex];
    const fromPicksText = offer.fromPicks.map(pick => `<div>#${pick.pick} (value: ${pick.value.toFixed(1)})</div>`).join('');
    const toPickText = `<div>#${offer.toPick.pick} (value: ${offer.toPick.value.toFixed(1)})</div>`;
    const tradeOfferText = document.getElementById('tradeOfferText');

    if (!tradeOfferText) {
        console.error("Trade offer text element not found!");
        return;
    }

    const fromTeamLogo = `../images/${offer.fromTeam.toLowerCase().replace(/\s/g, '-')}-logo.png`;
    const toTeamLogo = `../images/${userTeam.toLowerCase().replace(/\s/g, '-')}-logo.png`;

    // Calculate total value
    const totalOfferedValue = offer.fromPicks.reduce((total, pick) => total + pick.value, 0).toFixed(1);
    const totalUserValue = offer.toPick.value.toFixed(1);

    tradeOfferText.innerHTML = `
       <div class="trade-offer-container">
           <div class="trade-team">
               <img src="${toTeamLogo}" alt="${userTeam} Logo" class="team-logo-small">
               <h3>Your Team</h3>
               ${toPickText}
               <div class="total-value">Total value: ${totalUserValue}</div>
           </div>
           <div class="trade-team">
               <img src="${fromTeamLogo}" alt="${offer.fromTeam} Logo" class="team-logo-small">
               <h3>${offer.fromTeam}</h3>
               ${fromPicksText}
               <div class="total-value">Total value: ${totalOfferedValue}</div>
           </div>
       </div>
       <div class="trade-offer-buttons">
           ${currentOfferIndex > 0 ? `<button onclick="previousOffer()">Previous Offer</button>` : ''}
           <button onclick="acceptTrade(${currentOfferIndex})">Accept</button>
           <button onclick="declineTrade()">Decline</button>
           ${tradeOffers.length > 1 && currentOfferIndex < tradeOffers.length - 1 ? `<button onclick="nextOffer()">Next Offer</button>` : ''}
           <button onclick="hideTradeOffers()">Hide Offers</button>
       </div>
       <div>Offer ${currentOfferIndex + 1} of ${tradeOffers.length}</div>
   `;
}


function nextOffer() {
    currentOfferIndex = (currentOfferIndex + 1) % tradeOffers.length;
    displayCurrentOffer();
}

function previousOffer() {
    currentOfferIndex = (currentOfferIndex - 1 + tradeOffers.length) % tradeOffers.length;
    displayCurrentOffer();
}

// Function to show trade offers modal
function showTradeOffersModal(offers) {
    console.log("Showing trade offers modal.");
    const modal = document.getElementById('tradeOfferModal');
    const span = modal.querySelector('.close');

    if (!modal || !span) {
        console.error("Modal elements not found!");
        return;
    }

    currentOfferIndex = 0;
    displayCurrentOffer();

    modal.style.display = 'block';
    document.getElementById('showTradeOffers').style.display = 'none';

    span.onclick = function () {
        hideTradeOffers(); // Call hideTradeOffers instead of hiding the modal permanently
    }

    window.onclick = function (event) {
        if (event.target === modal) {
            hideTradeOffers(); // Call hideTradeOffers instead of hiding the modal permanently
        }
    }
}



// Function to hide trade offers
function hideTradeOffers() {
    document.getElementById('tradeOfferModal').style.display = 'none';
    document.getElementById('showTradeOffers').style.display = 'inline-block';
}

// Function to show trade offers
function showTradeOffers() {
    document.getElementById('tradeOfferModal').style.display = 'block';
    document.getElementById('showTradeOffers').style.display = 'none';
}

// Function to go to the next offer
function nextOffer() {
    currentOfferIndex = (currentOfferIndex + 1) % tradeOffers.length;
    displayCurrentOffer();
}

function acceptTrade(offerIndex) {
    if (offerIndex < 0 || offerIndex >= tradeOffers.length) {
        console.error("Invalid trade offer index!");
        return;
    }

    const offer = tradeOffers[offerIndex];

    fetch(`${apiUrl}/api/makeTrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer, userTeam, currentRound })
    })
        .then(response => response.json())
        .then(data => {
            console.log('Server response:', data);

            if (!data.draftState || !data.draftSequence) {
                throw new Error('Invalid draft state or sequence returned from server');
            }

            draftState = data.draftState;
            draftSequence = data.draftSequence;
            currentRound = data.currentRound;

            // Close the trade offer modal
            document.getElementById('tradeOfferModal').style.display = 'none';

            // Update the UI
            updateDraftDisplay();

            // Resume the draft
            processDraftSequence();
        })
        .catch(error => {
            console.error('Error accepting trade:', error);
            alert(`Error accepting trade: ${error.message}`);
        });
}


// Add this function to update the draft display after a trade
function updateDraftDisplay() {
    updateDraftHistory(draftState.draftHistory);
    fetchPlayers();
    // You may need to update other UI elements here
}

// Function to decline a trade
function declineTrade() {
    currentOfferIndex++;
    if (currentOfferIndex < tradeOffers.length) {
        displayCurrentOffer();
    } else {
        document.getElementById('tradeOfferModal').style.display = 'none';
        enableUserPick();
    }
}

// Function to enable user pick
function enableUserPick() {
    document.getElementById('selectPlayer').disabled = false;
    console.log("It's your turn to pick!");
}

// Function to check if the round has ended
function checkRoundEnd() {
    console.log(`Checking round end. Current Round: ${currentRound}, Draft Sequence Length: ${draftSequence.length}`);
    if (draftSequence.length === 0 && currentRound === totalRounds) {
        console.log("Draft complete. Showing results modal.");
        showResultsModal();
    } else if (draftSequence.length === 0) {
        currentRound++;
        processDraftSequence();
    } else {
        console.log(`Draft is still in progress. Current Round: ${currentRound}, Draft Sequence Length: ${draftSequence.length}`);
    }
}


// Function to initialize draft controls
function initializeDraftControls() {
    const selectPlayerButton = document.getElementById('selectPlayer');

    if (!selectPlayerButton) {
        console.error("Select player button not found!");
        return;
    }

    selectPlayerButton.addEventListener('click', function () {
        const selectedPlayerName = document.getElementById('playerSelect').value;
        const selectedTeam = userTeam;
        console.log(`Selected Team: ${selectedTeam}`);

        const selectedPlayer = allPlayers.find(player => player.name === selectedPlayerName);

        fetch(`${apiUrl}/api/selectPlayer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player: selectedPlayerName, team: selectedTeam })
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.message);
                    });
                }
                return response.json();
            })
            .then(data => {
                const teamLogo = `../images/${selectedTeam.toLowerCase().replace(/\s/g, '-')}-logo.png`;
                document.getElementById('draftResults').innerHTML += `
                   <div class="draft-pick-item">
                       <img src="${teamLogo}" alt="${selectedTeam} Logo" class="team-logo-small">
                       <strong>${selectedPlayerName}</strong>, ${selectedPlayer.position}, ${selectedPlayer.team}
                   </div>`;
                fetchPlayers();
                updateDraftHistory(data.draftHistory);
                document.getElementById('selectPlayer').disabled = true;
                setTimeout(processDraftSequence, 500);
            })
            .catch(error => {
                console.error('Failed to select player:', error);
                alert(`Error: ${error.message}`);
            });
    });

    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(button => {
        button.addEventListener('click', function () {
            document.querySelector('.filter-btn.active').classList.remove('active');
            button.classList.add('active');
            filterPlayers(button.id.replace('filter-', ''));
            document.getElementById('selectPlayer').disabled = false; // Ensure the button is enabled after filtering
        });
    });
}

// Function to simulate the draft
function simulateDraft() {
    fetch(`${apiUrl}/api/simulateDraft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userTeam })
    })
        .then(response => response.json())
        .then(data => {
            console.log("Draft sequence:", data.draftSequence);
            draftSequence = data.draftSequence;
            processDraftSequence();
        })
        .catch(error => console.error('Error simulating draft:', error));
}

function showResultsModal() {
    const resultsModal = document.getElementById('resultsModal');
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = ''; // Clear previous results

    // Add the new h1 element
    const heading = document.createElement('h1');
    heading.textContent = 'Your 2025 Draft Class';
    heading.style.textAlign = 'center';
    resultsContainer.appendChild(heading);

    // Fetch draft history from server
    fetch(`${apiUrl}/api/draftHistory`)
        .then(response => response.json())
        .then(draftHistory => {
            const userTeam = localStorage.getItem('selectedTeam').trim().toLowerCase();
            console.log('User Team:', userTeam);
            console.log('Draft History:', draftHistory);

            const userPicks = draftHistory.filter(pick => pick.team.trim().toLowerCase() === userTeam);
            console.log('User Picks:', userPicks);

            if (userPicks.length === 0) {
                resultsContainer.innerHTML += '<p>No picks made for your team.</p>';
            } else {
                userPicks.forEach(pick => {
                    const teamLogo = `../images/${pick.team.toLowerCase().replace(/\s/g, '-')}-logo.png`;
                    const pickElement = document.createElement('div');
                    pickElement.className = 'draft-pick-item';
                    pickElement.innerHTML = `
                       <img src="${teamLogo}" alt="${pick.team} Logo" class="team-logo-small">
                       <strong>${pick.pick}. ${pick.player}</strong>, ${pick.position}, ${pick.college}
                   `;
                    resultsContainer.appendChild(pickElement);
                });
            }

            resultsModal.style.display = 'block';
        })
        .catch(error => {
            console.error('Error fetching draft history:', error);
            resultsContainer.innerHTML = '<p>Error fetching draft history.</p>';
        });
}



// Event listener to close the modal
document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('resultsModal').style.display = 'none';
});

// Event listener to close the modal when clicking outside of it
window.addEventListener('click', (event) => {
    const resultsModal = document.getElementById('resultsModal');
    if (event.target === resultsModal) {
        resultsModal.style.display = 'none';
    }
});

// Document ready function
document.addEventListener('DOMContentLoaded', function () {
    userTeam = localStorage.getItem('selectedTeam');
    const selectedTeamLogo = localStorage.getItem('selectedTeamLogo');

    if (!userTeam || !selectedTeamLogo) {
        alert('No team data found. Returning to selection page.');
        window.location.href = 'index.html';
        return;
    }

    const teamLogoImg = document.getElementById('teamLogo');
    teamLogoImg.src = selectedTeamLogo;
    teamLogoImg.alt = `${userTeam} Logo`;
    document.getElementById('teamName').textContent = `Drafting for: ${userTeam}`;

    startDraft().then(() => {
        loadTeamsData().then(() => {
            fetchDraftState().then(() => {
                fetchPlayers();
                initializeDraftControls();
                simulateDraft();
            });
        });
    });
});

