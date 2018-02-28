const express = require('express');
const request = require('request');
const _ = require('lodash');

const router = express.Router();

class DraftInstance {
  constructor(
    players,
    users,
    draftOrder,
    draftHistory,
    userRoster,
  ) {
    this.players = players || [];
    this.users = users || [];
    this.draftOrder = draftOrder || [];
    this.draftHistory = draftHistory || [];
    this.userRoster = userRoster;
    this.currentPickIndex = 0;
    this.previousPickPlayerId = undefined;
    this.previousPickUserId = undefined;
    this.currentPickUserId = undefined;
    this.currentRound = undefined;
    this.currentPickNumber = undefined;
    this.futurePicks = this.createFuturePicks();
    this.draftPaused = false;
  }

  pauseDraft() {
    this.draftPaused = true;
  }

  resumeDraft() {
    this.draftPaused = false;
  }

  createPickEvent() {
    return {
      previousPickUserId: this.previousPickUserId,
      previousPickPlayerId: this.previousPickPlayerId,
      currentPickUserId: this.currentPickUserId,
      futurePicks: this.createFuturePicks(),
      previousPickRound: this.getPreviousPickRound(),
      previousPickPickNumber: this.getPreviousPickNumber(),
    };
  }

  advanceToNextPick() {
    this.currentPickIndex += 1;
    this.currentPickUserId = this.getCurrentUserPick();
    return this.createPickEvent();
  }

  updatePrevious(playerId, userId) {
    this.previousPickPlayerId = playerId;
    this.previousPickUserId = userId;
  }

  draftPlayer(playerId, userId) {
    if (this.draftPaused === true) {
      console.log('Drafted paused right now, cannot draft.');
      return -2;
    }

    // Check to make sure it is current user's turn
    if (userId !== this.getCurrentUserPick()) {
      return -1;
    }

    this.updatePrevious(playerId, userId);
    this.addPlayerToDraftHistory(playerId, userId);
    this.addPlayerToUserRoster(playerId, userId);
    this.markPlayerAsDrafted(playerId);
    return this.advanceToNextPick();
  }

  addPlayerToUserRoster(playerId, userId) {
    const rosterPlayer = {
      playerId,
      userId,
      round: this.getCurrentRound(),
      pickNumber: this.getCurrentPickNumber(),
    };

    if (this.getUserRoster(userId)) {
      this.getUserRoster(userId).push(rosterPlayer);
    }
  }

  getUserRoster(userId) {
    return this.userRoster[userId];
  }

  findPlayer(playerId) {
    return _.find(this.players, (player) => {
      return player.id === playerId;
    });
  }

  markPlayerAsDrafted(playerId) {
    const playerToMark = this.findPlayer(playerId);
    playerToMark.isDrafted = true;
  }

  markPlayerAsNotDrafted(playerId) {
    const playerToMark = this.findPlayer(playerId);
    playerToMark.isDrafted = false;
  }

  getDraftHistory() {
    return this.draftHistory;
  }

  getCurrentUserPick() {
    return this.draftOrder[this.currentPickIndex] &&
      this.draftOrder[this.currentPickIndex].userId;
  }

  getCurrentRound() {
    return this.draftOrder[this.currentPickIndex] &&
      this.draftOrder[this.currentPickIndex].round;
  }

  getCurrentPickNumber() {
    // console.log(JSON.stringify(this.draftOrder[this.currentPickIndex]));
    return this.draftOrder[this.currentPickIndex] &&
      this.draftOrder[this.currentPickIndex].pickNumber;
  }

  getPreviousPickRound() {
    return this.draftOrder[this.currentPickIndex - 1] &&
      this.draftOrder[this.currentPickIndex - 1].round;
  }

  getPreviousPickNumber() {
    // console.log(JSON.stringify(this.draftOrder[this.currentPickIndex]));
    return this.draftOrder[this.currentPickIndex - 1] &&
      this.draftOrder[this.currentPickIndex - 1].pickNumber;
  }

  addPlayerToDraftHistory(playerId, userId) {
    const draftHistoryModel = {
      previousPickPlayerId: playerId,
      previousPickUserId: userId,
      previousPickRound: this.getCurrentRound(),
      previousPickPickNumber: this.getCurrentPickNumber(),
    };

    this.draftHistory.push(draftHistoryModel);
  }

  createFuturePicks() {
    return this.draftOrder.slice(
      this.currentPickIndex,
      this.currentPickIndex + 10,
    );
  }

  getFuturePicks() {
    return this.futurePicks;
  }

  // Expensive call, only return on initial load since it returns all players
  getPlayers() {
    return this.players;
  }

  getUsers() {
    return this.users;
  }

  getCurrentPickIndex() {
    return this.currentPickIndex;
  }

  rollbackPick() {
    return new Promise((resolve, reject) => {
      if (this.currentPickIndex > 0) {
        this.currentPickIndex -= 1;

        // Rollback draft history
        const previousPlayer = this.draftHistory.shift();
        // Rollback future picks
        this.createFuturePicks();
        // Rollback user rosters
        const userRoster = this.userRoster[this.currentPickUserId];
        _.find(userRoster, (player) => {
          return player.playerId === this.previousPickUserId;
        });
        // Rollback current pick userId
        this.currentPickUserId = this.previousPickUserId;

        // Rollback picked player
        this.markPlayerAsNotDrafted(previousPlayer.previousPickPlayerId);
      }
      return reject(new Error('Current pick is already the start.'));
    });
  }

  updateUserStatus(userId, status) {
    const user = this.users[userId];
    if (user) {
      user.online = status;
    }
  }

  getIsPaused() {
    return this.draftPaused;
  }
}

const mockDraftOrder = [{
  userId: 2,
  round: 1,
  pickNumber: 1,
}, {
  userId: 3,
  round: 1,
  pickNumber: 2,
}, {
  userId: 2,
  round: 2,
  pickNumber: 3,
}, {
  userId: 3,
  round: 2,
  pickNumber: 4,
}, {
  userId: 2,
  round: 3,
  pickNumber: 5,
}, {
  userId: 3,
  round: 3,
  pickNumber: 6,
}, {
  userId: 2,
  round: 4,
  pickNumber: 7,
}, {
  userId: 3,
  round: 4,
  pickNumber: 8,
}, {
  userId: 2,
  round: 5,
  pickNumber: 9,
}, {
  userId: 3,
  round: 5,
  pickNumber: 10,
}];

const mockUserRoster = {
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
};

let draftInstance;

const loadPlayers = new Promise((resolve, reject) => {
  request('http://localhost:3000/api/players', { json: true }, (error, response) => {
    if (error) {
      return reject(error);
    }

    const rawPlayers = response.body && response.body.data;
    const players = [];
    rawPlayers.forEach((player) => {
      const newPlayer = {
        isDrafted: false,
      };
      players.push(Object.assign({}, player, newPlayer));
    });
    return resolve(players);
  });
});

const loadUsers = new Promise((resolve, reject) => {
  request('http://localhost:3000/api/users', { json: true }, (error, response) => {
    if (error) {
      return reject(error);
    }

    const users = response.body && response.body.data;

    // Add default status field
    const expandedUsers = [];
    users.forEach((user) => {
      const expandedUser = user;
      expandedUser.online = false;
      expandedUsers.push(expandedUser);
    });
    return resolve(expandedUsers);
  });
});

Promise.all([loadPlayers, loadUsers]).then((values) => {
  const players = values[0];
  const users = values[1];

  draftInstance = new DraftInstance(
    players,
    users,
    mockDraftOrder,
    [],
    mockUserRoster,
  );
});

const forceClientRefresh = (socket) => {
  socket.emit('force_refresh');
};

// Connections
module.exports = (io) => {
  io.on('connection', (socket) => {
    // const socketUserId = socket.id;
    if (!(socket.request && socket.request.session && socket.request.session.userId)) {
      console.log('Error with establishing user connection');
      forceClientRefresh(socket);
      return;
    }
    const userId = socket.request.session.userId;
    // const userId = userList.indexOf(socketUserId);
    draftInstance.updateUserStatus(userId, true);

    socket.emit('connection_verified', userId);
    io.emit('user_status', { userId, online: true });

    // On first load data hydration
    // Send out required initial preload data first
    // that the rest of the data (history/ticker etc.)
    // have dependencies on.
    // If server resets, retry on existing client connections
    // until new data is retrieved.
    let numOfAttempts = 0;
    const sendDraftOrchestration = () => {
      const orchestrationData = {
        players: draftInstance.getPlayers(),
        users: draftInstance.getUsers(),
      };
      socket.emit('draft_orchestration_preload', orchestrationData);
    };

    const draftOrchestrationAttempt = () => {
      if (numOfAttempts < 60) {
        setTimeout(() => {
          if (draftInstance) {
            console.log('sent data');
            // sendDraftOrchestration();
          } else {
            numOfAttempts += 1;
            console.log(`Num of retry attempts: ${numOfAttempts}`);
            draftOrchestrationAttempt();
          }
        }, 1000);
      } else {
        socket.emit('kill');
      }
    };

    if (draftInstance) {
      console.log('Sent on first try.');
      sendDraftOrchestration();
    } else {
      draftOrchestrationAttempt();
    }

    socket.on('draft_orchestration_preload_success', () => {
      const preloadData = {
        draftHistory: draftInstance.getDraftHistory(),
        futurePicks: draftInstance.getFuturePicks(),
        userRoster: draftInstance.getUserRoster(userId),
        currentPickUserId: draftInstance.getCurrentUserPick(),
        isPaused: draftInstance.getIsPaused(),
      };
      console.log(`userId: ${userId} has successfully downloaded setup data`);
      console.log(`userId that is sent to client: ${userId}`);
      socket.emit('draft_orchestration_load', preloadData);
      io.emit('user_status', { userId, online: true });
    });

    // Client drafts a player
    socket.on('draft_player', (selectedPlayerId) => {
      console.log(userId);
      const roundEventData = draftInstance.draftPlayer(selectedPlayerId, userId);
      if (roundEventData === -1) {
        // Tell user that you can't draft out of turn
        console.log(`User ${userId} is trying to draft out of turn. BLOCK THIS IN CLIENT DUMBO!`);

        // tell user that draft is over
      } else {
        io.emit('player_drafted', roundEventData);
      }
    });

    socket.on('get_user_roster', (requestedUserId) => {
      const roster = draftInstance.getUserRoster(requestedUserId);
      socket.emit('get_user_roster_return', roster);
    });

    socket.on('search_player_by_position', (position) => {
      const cleanedPosition = position.toLowerCase();
      const players = draftInstance.getPlayers();
      let playersByPosition = [];
      if (!cleanedPosition || cleanedPosition.toLowerCase() === 'all') {
        playersByPosition = players;
      } else if (cleanedPosition === 'of') {
        players.forEach((player) => {
          if (
            player.positions &&
            (player.positions.toLowerCase().includes('rf') ||
            player.positions.toLowerCase().includes('cf') ||
            player.positions.toLowerCase().includes('lf'))
          ) {
            playersByPosition.push(player);
          }
        });
      } else {
        players.forEach((player) => {
          if (player.positions && player.positions.toLowerCase().includes(cleanedPosition)) {
            playersByPosition.push(player);
          }
        });
      }
      socket.emit('search_player_by_position_return', playersByPosition);
    });

    socket.on('search_player_by_name', (playerSearchString) => {
      const cleanedPlayerSearchString = playerSearchString.toLowerCase();
      const players = draftInstance.getPlayers();
      let playersByName = [];
      if (!cleanedPlayerSearchString || cleanedPlayerSearchString === '') {
        playersByName = players;
      } else {
        players.forEach((player) => {
          if (
            player.player_name &&
            player.player_name.toLowerCase().includes(cleanedPlayerSearchString)
          ) {
            playersByName.push(player);
          }
        });
      }
      socket.emit('search_player_by_name_return', playersByName);
    });

    // Admin socket responsibilities
    socket.on('admin_roll_back_pick', () => {
      draftInstance.rollbackPick().then((response) => {
        socket.emit('admin_roll_back_pick_return', response);
      }).catch((error) => {
        socket.emit('admin_roll_back_pick_return', error);
      });
    });

    socket.on('toggle_pause_draft', (isPaused) => {
      if (isPaused) {
        console.log('Draft paused');
        draftInstance.pauseDraft();
      } else {
        console.log('Draft resumed');
        draftInstance.resumeDraft();
      }
      io.emit('toggle_pause_draft_return', isPaused);
    });

    // Heartbeat sync check
    socket.on('heartbeat', (data) => {

    });

    socket.on('disconnect', () => {
      draftInstance.updateUserStatus(userId, false);
      io.emit('user_status', { userId, online: false });
      console.log(`user ${socket.id} disconnected`);
    });
  });

  return router;
};
