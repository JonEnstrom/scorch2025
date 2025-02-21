import { io } from 'socket.io-client';

// DOM elements
const refreshBtn = document.getElementById('refresh-btn');
const openCreateGameModalBtn = document.getElementById('open-create-game-modal-btn');
const changeNameBtn = document.getElementById('change-lobby-name-btn');
const gamesList = document.getElementById('games-list');
const lobbyPlayersList = document.getElementById('lobby-players-list');

let ownSocketId = null;
// Object to store lobby game info keyed by game name
let lobbyGames = {};
let showOnlyOpenSlots = true;
const showOpenSlotsToggle = document.getElementById('show-open-slots-toggle');
const gamesCountSpan = document.getElementById('games-count');

/**
 * Call /init-player to ensure the server sets our playerId cookie if we don't have one.
 */
async function ensurePlayerIdCookie() {
  try {
    await fetch('/init-player', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err) {
    console.error('Error calling /init-player:', err);
  }
}

/**
 * Initialize Socket.IO and attach event listeners.
 */
function initSocket() {
  const socket = io('/', {
    path: '/socket.io',
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    ownSocketId = socket.id;
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnection attempt #${attempt}...`);
  });

  socket.io.on('reconnect', (attempt) => {
    console.log(`Reconnected on attempt #${attempt} with socket id:`, socket.id);
    ownSocketId = socket.id;
  });

  socket.on('lobbyPlayersUpdated', (players) => {
    updateLobbyPlayersList(players);
  });

// Socket event handler for lobby game updates
socket.on('lobbyGameUpdated', (gameInfo) => {
    lobbyGames[gameInfo.gameName] = gameInfo;
  renderGamesList();
});

  return socket;
}

showOpenSlotsToggle.addEventListener('change', (e) => {
  showOnlyOpenSlots = !e.target.checked; // Invert the checked state
  renderGamesList();
});

/**
 * Manual fetch for the list of games.
 */
async function fetchGames() {
  try {
    const response = await fetch('/games', { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Error fetching games: ${response.statusText}`);
    }
    
    // Clear local lobbyGames state
    lobbyGames = {};
    
    // Store all games without filtering
    const games = await response.json();
    games.forEach(game => {
      lobbyGames[game.gameName] = game;
    });
    
    renderGamesList();
  } catch (err) {
    console.error('Error fetching games:', err);
    alert('Failed to fetch games. Please try again.');
  }
}


function spectateGame(gameName) {
  const gameUrl = `/game.html?gameId=${gameName}&spectator=true`;
  window.location.href = gameUrl;
  requestFullscreen();
}

/**
 * Render the games list using the lobbyGames object.
 */
function renderGamesList() {
  gamesList.innerHTML = '';
  
  // Filter games based on toggle state
  const filteredGames = Object.values(lobbyGames).filter(game => {
    if (showOnlyOpenSlots === false) return true; // Show all games when toggled on
    return game.slots.some(slot => slot.state === 'open'); // Default: only show games with open slots
  });
  
  // Update games count - show total games count regardless of filter
  gamesCountSpan.textContent = Object.keys(lobbyGames).length;
  
  if (filteredGames.length === 0) {
    const noGamesMsg = document.createElement('li');
    noGamesMsg.textContent = showOnlyOpenSlots ? 
      'No games with open slots available.' : 
      'No games available (including full games).';
    noGamesMsg.className = 'no-games-message';
    gamesList.appendChild(noGamesMsg);
    return;
  }

  // Use filteredGames instead of Object.values(lobbyGames)
  filteredGames.forEach((game) => {
    const li = document.createElement('li');
    li.className = 'game-item';

    // Game header and info container
    const headerInfo = document.createElement('div');
    headerInfo.className = 'game-info';

    // Game title
    const title = document.createElement('h3');
    title.textContent = game.gameName;
    
    // Round information
    const roundInfo = document.createElement('span');
    roundInfo.className = 'round-info';
    
    if (game.state === 'WAITING_FOR_PLAYERS') {
      roundInfo.textContent = 'Waiting for players';
    } else if (game.state === 'COUNTDOWN') {
      roundInfo.textContent = 'Countdown Started...';
    } else if (game.state === 'SHOPPING') {
      roundInfo.textContent = `Shopping Phase`;
      roundInfo.classList.add('shopping');
    } else if (game.state === 'ROUND_IN_PROGRESS') {
      roundInfo.textContent = `Round ${game.currentRound}/${game.totalRounds}`;
      roundInfo.classList.add('in-progress');
    } else if (game.state === 'GAME_OVER') {
      roundInfo.textContent = 'Game Over';
    }

    // Spectate button
    const spectateBtn = document.createElement('button');
    spectateBtn.className = 'spectate-btn';
    spectateBtn.textContent = 'Spectate';
    spectateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      spectateGame(game.gameName);
    });

    headerInfo.appendChild(title);
    headerInfo.appendChild(roundInfo);
    headerInfo.appendChild(spectateBtn);
    li.appendChild(headerInfo);

    // Container for slot information using grid layout
    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'game-slots-grid';

    game.slots.forEach((slot, index) => {
      const slotDiv = document.createElement('div');
      slotDiv.className = 'game-slot';
      slotDiv.style.position = 'relative';
  
      const slotContent = document.createElement('span');
      slotContent.className = 'slot-content';
  
      if (slot.state === 'human' || slot.state === 'cpu') {
        slotContent.textContent = slot.name;
        
        // Add health bar if health info is available
        if (slot.health !== undefined && slot.maxHealth !== undefined) {
          const healthBarContainer = document.createElement('div');
          healthBarContainer.className = 'health-bar-container';
          
          const healthBar = document.createElement('div');
          healthBar.className = 'health-bar';
          const healthPercent = (slot.health / slot.maxHealth) * 100;
          healthBar.style.width = `${healthPercent}%`;
          
          if (healthPercent <= 25) {
            healthBar.classList.add('low-health');
          } else if (healthPercent <= 50) {
            healthBar.classList.add('medium-health');
          }
          
          healthBarContainer.appendChild(healthBar);
          slotDiv.appendChild(healthBarContainer);

              // Add KIA overlay if player is defeated
    if (slot.health <= 0) {
      const kiaOverlay = document.createElement('div');
      kiaOverlay.className = 'kia-overlay';
      
      const kiaText = document.createElement('div');
      kiaText.className = 'kia-text';
      kiaText.textContent = 'DESTROYED';
      
      kiaOverlay.appendChild(kiaText);
      slotDiv.appendChild(kiaOverlay);
    }
        }
  
        const typeLabel = document.createElement('span');
        typeLabel.className = 'player-type-label';
        typeLabel.textContent = slot.state.toUpperCase();
        typeLabel.style.color = slot.state === 'human' ? 'green' : 'blue';
        slotDiv.appendChild(typeLabel);
      } else if (slot.state === 'open') {
        slotContent.textContent = 'Open - Join Game!';
        slotContent.classList.add('open-slot');
        slotDiv.addEventListener('click', () => joinGame(game.gameName));
      } else if (slot.state === 'closed') {
        slotContent.textContent = 'Closed Slot';
        slotContent.classList.add('closed-slot');
        slotDiv.classList.add('closed-slot');
      }
  
      slotDiv.appendChild(slotContent);
      slotsContainer.appendChild(slotDiv);
    });

    li.appendChild(slotsContainer);
    gamesList.appendChild(li);
  });
}

function generatePublicGameName() {
  const timestamp = new Date().getTime().toString().slice(-4);
  return `Public-${timestamp}`;
}

/**
 * Update the displayed list of lobby players.
 */
function updateLobbyPlayersList(players) {
  lobbyPlayersList.innerHTML = '';
  players.forEach((player) => {
    const li = document.createElement('li');
    const truncatedId = player.userId.slice(0, 7);
    if (player.currentSocketId === ownSocketId) {
      li.innerHTML = `${player.name} (You) <span class="player-id">#${truncatedId}</span>`;
      li.style.fontWeight = 'bold';
    } else {
      li.innerHTML = `${player.name} <span class="player-id">#${truncatedId}</span>`;
    }
    lobbyPlayersList.appendChild(li);
  });
}

/**
 * Join an existing game by name.
 */
function joinGame(gameName, asSpectator = false) {
  const gameUrl = `/game.html?gameId=${gameName}${asSpectator ? '&spectator=true' : ''}`;
  window.location.href = gameUrl;
  requestFullscreen();
}

/**
 * Request fullscreen mode.
 */
function requestFullscreen() {
  try {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  } catch (err) {
    console.warn('Failed to enter fullscreen:', err);
  }
}

/**
 * Change our player name in the lobby.
 */
function changeLobbyName() {
  const nameInput = document.getElementById('lobbyName');
  const newName = nameInput.value.trim();
  if (!newName) {
    alert('Please enter a valid name.');
    return;
  }
  window._lobbySocket.emit('lobbyChangeName', newName);
  nameInput.value = '';
}

/**
 * Main startup logic.
 */
async function main() {
  await ensurePlayerIdCookie();
  const socket = initSocket();
  window._lobbySocket = socket;
  fetchGames();
}

//--------------------------------------------------
// Modal functionality for creating a new game with slots and additional settings
//--------------------------------------------------

const modal = document.getElementById('create-game-modal');
const closeButton = document.querySelector('.close-button');
const cancelBtn = document.getElementById('cancel-btn');
const newGameForm = document.getElementById('new-game-form');
const terrainSeedInput = document.getElementById('terrainSeed');

// Function to open the modal
function openModal() {
  terrainSeedInput.value = Math.floor(100000 + Math.random() * 900000);
  const privateGameNameInput = document.getElementById('privateGameName');
  privateGameNameInput.value = generatePublicGameName();
  privateGameNameInput.readOnly = true;
  modal.style.display = 'flex';
}

// Function to close the modal
function closeModal() {
  modal.style.display = 'none';
}

// Event listeners for closing the modal
closeButton.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);

// Close modal if user clicks outside the modal content
window.addEventListener('click', function (event) {
  if (event.target === modal) {
    closeModal();
  }
});

// Event listener to open modal when Create New Game button is clicked
openCreateGameModalBtn.addEventListener('click', openModal);

// Toggle private game name field based on game type selection
const gameTypeRadios = document.querySelectorAll('input[name="gameType"]');
const privateGameNameContainer = document.getElementById('private-game-name-container');

gameTypeRadios.forEach(radio => {
  radio.addEventListener('change', function() {
    const privateGameNameInput = document.getElementById('privateGameName');
    if (this.value === 'public') {
      privateGameNameInput.value = generatePublicGameName();
      privateGameNameInput.readOnly = true;
    } else {
      privateGameNameInput.value = '';
      privateGameNameInput.readOnly = false;
      privateGameNameInput.placeholder = 'Enter private game name';
    }
  });
});

// Handle the form submission for new game with slots and additional settings
// Handle the form submission for new game with slots and additional settings
newGameForm.addEventListener('submit', async function (event) {
  event.preventDefault();

  const gameType = document.querySelector('input[name="gameType"]:checked').value;
  const gameName = document.getElementById('privateGameName').value.trim();
  
  if (!gameName) {
    alert('Please enter a game name.');
    return;
  }
  
  const visualTheme = document.getElementById('visualTheme').value;
  const terrainSeed = document.getElementById('terrainSeed').value.trim();
  const numRounds = document.getElementById('numRounds').value;

  // Gather player slot values
  const slots = [];
  for (let i = 1; i <= 8; i++) {
    const select = document.getElementById(`slot-${i}`);
    slots.push(select.value);
  }

  // Calculate the number of human and CPU players.
  let humanPlayers = 1; // slot 1 is always human
  let cpuPlayers = 0;
  for (let i = 2; i <= 8; i++) {
    if (slots[i - 1] === 'human') {
      humanPlayers++;
    } else if (slots[i - 1] === 'cpu') {
      cpuPlayers++;
    }
  }
  // Calculate numPlayers as the count of slots that are not closed.
  const numPlayers = slots.filter(slot => slot !== 'closed').length;

  try {
    const response = await fetch('/create-game', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameName,
        seed: parseInt(terrainSeed, 10),
        theme: visualTheme,
        totalRounds: parseInt(numRounds, 10),
        cpuPlayers,
        numPlayers,
        isPublic: gameType === 'public'
      }),
    });
    const data = await response.json();
    if (response.ok) {
      // Redirect to the game page
      const gameUrl = `/game.html?gameId=${data.gameName}`;
      window.location.href = gameUrl;
      // Attempt fullscreen
      requestFullscreen();
    } else {
      alert(data.error || 'Unknown error creating game.');
    }
  } catch (err) {
    console.error(err);
    alert('Error creating game.');
  }

  // Close the modal when done.
  closeModal();
});

// Hook up UI event listeners
refreshBtn.addEventListener('click', fetchGames);
changeNameBtn.addEventListener('click', changeLobbyName);

// Run main startup logic
main();
