import React, { useEffect, useState, useRef } from 'react';
import {
  MemoryRouter as Router,
  Switch,
  Route,
  withRouter,
} from 'react-router-dom';

import './App.global.css';

const _ = require('lodash');
const path = require('path');
const play = require('audio-play');
const load = require('audio-loader');

const bankRates = [10, 20, 50, 100, 200, 300, 400, 500];

const getFormattedTimeLeft = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return `${mins}:${secs < 10 ? `0${secs}` : secs}`;
};

const Stats = () => {
  const stats = JSON.parse(localStorage.getItem('stats'));
  const players = JSON.parse(localStorage.getItem('initialPlayers'));

  return (
    <div className="statsBlock">
      {Object.keys(stats).map((round) => {
        const roundFormatted = Number(round) + 1;
        const strongUserId = Number(
          _.maxBy(Object.keys(stats[round]), (item) => stats[round][item])
        );
        const weakUserId = Number(
          _.minBy(Object.keys(stats[round]), (item) => stats[round][item])
        );
        const strongUser = players.find((item) => item.id === strongUserId);
        const weakUser = players.find((item) => item.id === weakUserId);

        return (
          <div key={round}>
            <div>Round: {roundFormatted}</div>
            <div>Strong: {strongUser ? strongUser.name : ''}</div>
            <div>Weak: {weakUser ? weakUser.name : ''}</div>
          </div>
        );
      })}
    </div>
  );
};

const Vote = withRouter(({ history }) => {
  const refPause = useRef();

  useEffect(async () => {
    const sound = await load(path.join(__dirname, 'sounds', 'vote.mp3'));
    refPause.current = play(sound, { loop: true });
  }, []);

  const [vote, setVote] = useState({});
  const [elliminatedPlayerId, setElliminatedPlayerId] = useState(null);

  const players = JSON.parse(localStorage.getItem('players'));

  const isAllVoted = Object.keys(vote).length === players.length;

  const voteResult = _.countBy(Object.values(vote));

  const maxVoted = _.max(Object.values(voteResult));
  const doublePlayers = Object.keys(voteResult)
    .filter((item) => voteResult[item] === maxVoted)
    .map((item) => players.find((item2) => item2.id === Number(item)));

  return (
    <div>
      <Stats />
      <div className="whoEliminate">Кого выгоняем?</div>
      <div className="voteList">
        {players.map((item, index) => {
          return (
            <label key={index}>
              {players[index].name}&nbsp;Голосует за:&nbsp;
              <select
                className="radio"
                name="player"
                onChange={(e) => {
                  setVote({
                    ...vote,
                    [item.id]: e.target.value,
                  });
                }}
              >
                <option />
                {players
                  .filter((item, index2) => index2 !== index)
                  .map((item, index) => (
                    <option key={index} value={item.id}>{item.name}</option>
                  ))}
              </select>
            </label>
          );
        })}

        {doublePlayers.map((item) => {
          return (
            <button
              disabled={!isAllVoted || elliminatedPlayerId}
              onClick={() => setElliminatedPlayerId(item.id)}
            >
              Выгоняем {item.name}
            </button>
          );
        })}

        <button
          type="submit"
          disabled={!elliminatedPlayerId}
          onClick={() => {
            localStorage.setItem(
              'players',
              JSON.stringify(
                players.filter((item) => item.id !== elliminatedPlayerId)
              )
            );

            const nextRound = Number(
              history.location.search.replace('?nextRound=', '')
            );

            history.push(`/round/${nextRound}`);
            refPause.current && refPause.current();
          }}
        >
          Следующий раунд
        </button>
      </div>
    </div>
  );
});

const PlayersList = withRouter(({ history }) => {
  const refPause = useRef();

  const [players, setPlayers] = useState(new Array(10).fill(null));

  useEffect(async () => {
    const sound = await load(path.join(__dirname, 'sounds', 'initial.mp3'));
    refPause.current = play(sound, { loop: true });
  }, []);

  const currentPlayers = players.filter((item) => !!item);

  return (
    <div>
      <div className="playersList">
        {players.map((_, index) => {
          return (
            <input
              key={index}
              placeholder={`Игрок ${index + 1}`}
              onChange={(e) => {
                const player = e.target.value;

                let newPlayers = [...players]

                if (player) {
                  newPlayers.splice(index, 1, {
                    id: index,
                    name: e.target.value,
                  });
                } else {
                  newPlayers = newPlayers.map((item) =>
                    item?.id === index ? null : item
                  );
                }
                setPlayers(newPlayers);
              }}
            />
          );
        })}

        <button
          type="submit"
          disabled={currentPlayers.length < 3}
          onClick={() => {
            refPause.current && refPause.current();

            const filteredPlayers = players.filter((item) => !!item);

            localStorage.setItem('initialPlayers', JSON.stringify(filteredPlayers));
            localStorage.setItem('players', JSON.stringify(filteredPlayers));
            localStorage.setItem('stats', JSON.stringify({}));
            localStorage.setItem('bank', JSON.stringify(0));

            history.push('/round/0');
          }}
        >
          Поехали
        </button>
      </div>
    </div>
  );
});

const Round = withRouter(({ history, match }) => {
  const {
    params: { index },
  } = match;

  const storeBank = JSON.parse(localStorage.getItem('bank'));
  const storeStats = JSON.parse(localStorage.getItem('stats'));
  const players = JSON.parse(localStorage.getItem('players'));

  const [stats, setStats] = useState({});
  const activePlayers = _.orderBy(
    players.map((item) => {
      const prevRoundAllStats = storeStats[Number(index) - 1];
      const prevRoundStats = prevRoundAllStats
        ? prevRoundAllStats[item.id]
        : 0;

      return {
        ...item,
        stats: stats[item.id],
        prevRoundStats,
      };
    }),
    ['prevRoundStats'],
    ['desc']
  );

  const refPause = useRef();
  const refNoTimePause = useRef();
  const initialSeconds = 120 - index * 10;
  const [currentBankStep, setCurrentBankStep] = useState(-1);
  const [bank, setBank] = useState(0);
  const [seconds, setSeconds] = useState(initialSeconds);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);

  useEffect(async () => {
    const sound = await load(path.join(__dirname, 'sounds', 'round.mp3'));
    refPause.current = play(sound, { loop: true });
  }, []);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (seconds > 0) {
        setSeconds(seconds - 1);
      } else {
        const sound = await load(path.join(__dirname, 'sounds', 'no-time.mp3'));
        refNoTimePause.current = play(sound);
        refPause.current();

        clearTimeout(timeout);
      }
    }, 1000);
  }, [seconds]);

  return (
    <div>
      <Stats />
      <div className="round">Раунд: {Number(index) + 1}</div>
      <div className="nameLabel">
        Отвечает:{' '}
        <span className="nameValue">
          {activePlayers[currentPlayerIndex].name}
        </span>
      </div>
      <button
        className="successButton"
        onClick={() => {
          if (currentPlayerIndex === activePlayers.length - 1) {
            setCurrentPlayerIndex(0);
          } else {
            setCurrentPlayerIndex(currentPlayerIndex + 1);
          }

          if (currentBankStep + 1 < bankRates.length) {
            setCurrentBankStep(currentBankStep + 1);
          }

          setStats({
            ...stats,
            [activePlayers[currentPlayerIndex].id]:
              (stats[activePlayers[currentPlayerIndex].id] || 0) + 1,
          });
        }}
      >
        ВЕРНО
      </button>
      <button
        className="errorButton"
        onClick={() => {
          if (currentPlayerIndex === activePlayers.length - 1) {
            setCurrentPlayerIndex(0);
          } else {
            setCurrentPlayerIndex(currentPlayerIndex + 1);
          }

          setCurrentBankStep(-1);

          setStats({
            ...stats,
            [activePlayers[currentPlayerIndex].id]:
              (stats[activePlayers[currentPlayerIndex].id] || 0) - 1,
          });
        }}
      >
        НЕ ВЕРНО
      </button>

      <button
        disabled={currentBankStep === -1}
        className={`infoButton ${
          currentBankStep === -1 && 'infoButton_disabled'
        }`}
        onClick={() => {
          setBank(bank + bankRates[currentBankStep]);
          setCurrentBankStep(-1);

          setStats({
            ...stats,
            [activePlayers[currentPlayerIndex].id]:
            (stats[activePlayers[currentPlayerIndex].id] || 0) + bankRates[currentBankStep] * 0.0001,
          });
        }}
      >
        БАНК {currentBankStep !== -1 && `+${bankRates[currentBankStep]}`}
      </button>
      <div className="time">{getFormattedTimeLeft(seconds)}</div>

      <button
        // disabled={seconds}
        onClick={() => {
          const storeBank = JSON.parse(localStorage.getItem('bank'));
          const currentStats = JSON.parse(localStorage.getItem('stats'));
          localStorage.setItem(
            'stats',
            JSON.stringify({ ...currentStats, [index]: stats })
          );

          refPause.current && refPause.current();

          localStorage.setItem('bank', JSON.stringify(storeBank + bank));

          history.push(`/vote?nextRound=${Number(index) + 1}`);
        }}
      >
        Голосование
      </button>

      <div className="bank">Банк: {bank}</div>

      <div className="totalBank">Общий банк: {storeBank + bank}</div>

      <div>
        {_.orderBy(activePlayers, ['stats'], ['desc']).map((item, index) => (
          <div key={index}>
            {item.name}: {item.stats}
          </div>
        ))}
      </div>
    </div>
  );
});

export default function App() {
  return (
    <Router>
      <Switch>
        <Route path="/vote" component={Vote} />
        <Route path="/round/:index" component={Round} />
        <Route path="/" component={PlayersList} />
      </Switch>
    </Router>
  );
}
