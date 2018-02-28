import { connect } from 'react-redux';
import AdminPanel from './../components/AdminPanel';
import * as playerDrafterActions from './../actions/playerDrafterActions';

const mapStateToProps = (state) => {
  return {
    isPaused: state.playerSearcher.isPaused,
  };
};

const toggleDraft = (isPaused, socket) => {
  return (dispatch) => {
    socket.emit('toggle_pause_draft', isPaused);
    dispatch(playerDrafterActions.updateDraftPauseState(isPaused));
  };
};

const mapDispatchToProps = (dispatch, socket) => {
  return {
    toggleDraft: (isPaused) => {
      return dispatch(toggleDraft(isPaused, socket.socket));
    },
  };
};

const Admin = connect(
  mapStateToProps,
  mapDispatchToProps,
)(AdminPanel);

export default Admin;
