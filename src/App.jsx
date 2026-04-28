import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Настройка API
const API = axios.create({
  baseURL: 'https://daytrack-server-2.onrender.com/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
});

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [view, setView] = useState('calendar');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [ratings, setRatings] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [sliderValue, setSliderValue] = useState(3);
  const [stats, setStats] = useState({ avgRating: 0, totalDays: 0 });
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [showChangeUsername, setShowChangeUsername] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [changingName, setChangingName] = useState(false);
  
  // Система очков и таймеров
  const [points, setPoints] = useState(0);
  const [level, setLevel] = useState(1);
  const [nextPointTimer, setNextPointTimer] = useState(null);
  const [lastRatedDate, setLastRatedDate] = useState(null);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [lossAlertShown, setLossAlertShown] = useState(false);
  
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingUser, setViewingUser] = useState(null);
  const [showUserList, setShowUserList] = useState(false);
  const [isViewingOther, setIsViewingOther] = useState(false);
  const [viewingUserProgress, setViewingUserProgress] = useState(null);

  // Функция для получения времени до полуночи по Москве
  const getTimeUntilMidnightMSK = () => {
    const now = new Date();
    const mskTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const midnight = new Date(mskTime);
    midnight.setHours(24, 0, 0, 0);
    return midnight - mskTime;
  };

  // Форматирование времени
  const formatTime = (ms) => {
    if (ms <= 0) return '00:00:00';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Проверка, можно ли получить очко сегодня
  const canGetPoint = () => {
    if (!lastRatedDate) return true;
    const last = new Date(lastRatedDate);
    const now = new Date();
    const lastMSK = new Date(last.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const nowMSK = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    
    return lastMSK.getDate() !== nowMSK.getDate() ||
           lastMSK.getMonth() !== nowMSK.getMonth() ||
           lastMSK.getFullYear() !== nowMSK.getFullYear();
  };

  // Проверка и потеря очков при пропуске дня
  const checkAndLosePoints = () => {
    if (!lastRatedDate) return false;
    
    const last = new Date(lastRatedDate);
    const now = new Date();
    const lastMSK = new Date(last.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const nowMSK = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    
    const daysPassed = Math.floor((nowMSK - lastMSK) / (1000 * 60 * 60 * 24));
    
    if (daysPassed === 1 && !canGetPoint() && !lossAlertShown) {
      const newPoints = Math.max(0, points - 5);
      const newLevel = Math.floor(newPoints / 30) + 1;
      setPoints(newPoints);
      setLevel(newLevel);
      saveProgressToServer(newPoints, newLevel, lastRatedDate);
      setLossAlertShown(true);
      alert(`⚠️ Вы пропустили день! -5 очков. Уровень: ${newLevel}`);
      setTimeout(() => setLossAlertShown(false), 60000);
      return true;
    }
    else if (daysPassed >= 2 && !lossAlertShown) {
      setPoints(0);
      setLevel(1);
      setLastRatedDate(null);
      saveProgressToServer(0, 1, null);
      setLossAlertShown(true);
      alert(`⚠️ Вы пропустили несколько дней! Уровень сброшен до 1`);
      setTimeout(() => setLossAlertShown(false), 60000);
      return true;
    }
    return false;
  };

  // Сохранение прогресса на сервер
  const saveProgressToServer = async (newPoints, newLevel, newLastRatedDate) => {
    if (!token) return;
    try {
      await API.post('/user/progress', {
        points: newPoints,
        level: newLevel,
        last_rated_date: newLastRatedDate
      });
    } catch (error) {
      console.error('Save progress error:', error);
    }
  };

  // Загрузка прогресса с сервера
  const loadProgressFromServer = async () => {
    if (!token) return;
    try {
      const res = await API.get('/user/progress');
      setPoints(res.data.points || 0);
      setLevel(res.data.level || 1);
      setLastRatedDate(res.data.last_rated_date || null);
    } catch (error) {
      console.error('Load progress error:', error);
    } finally {
      setProgressLoaded(true);
    }
  };

  // Обновление таймеров
  const updateTimers = () => {
    const timeToMidnight = getTimeUntilMidnightMSK();
    setNextPointTimer(timeToMidnight);
  };

  // Эффект для таймеров и проверки потери очков
  useEffect(() => {
    if (!token || isViewingOther || !progressLoaded) return;
    
    updateTimers();
    const interval = setInterval(() => {
      updateTimers();
      checkAndLosePoints();
    }, 1000);
    
    return () => clearInterval(interval);
  }, [token, lastRatedDate, points, isViewingOther, progressLoaded]);

  // Восстановление сессии и загрузка прогресса
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      API.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
      loadProgressFromServer();
    } else {
      setProgressLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (token && !isViewingOther && progressLoaded) {
      fetchRatings();
      fetchStats();
    } else if (token && viewingUser) {
      fetchUserRatings();
      fetchUserStats();
      fetchUserProgress();
    }
  }, [token, currentYear, currentMonth, viewingUser, isViewingOther, progressLoaded]);

  const fetchRatings = async () => {
    if (!token) return;
    try {
      const res = await API.get(`/ratings/month/${currentYear}/${currentMonth + 1}`);
      const data = {};
      res.data.forEach(r => { data[r.date] = r.rating; });
      setRatings(data);
    } catch (error) {
      console.error('fetchRatings error:', error);
    }
  };

  const fetchStats = async () => {
    if (!token) return;
    try {
      const res = await API.get('/ratings/stats');
      setStats({ avgRating: res.data.avgRating || 0, totalDays: res.data.totalDays || 0 });
    } catch (error) {
      console.error('fetchStats error:', error);
    }
  };

  const fetchUserRatings = async () => {
    if (!viewingUser) return;
    try {
      const res = await API.get(`/users/${viewingUser.id}/ratings/${currentYear}/${currentMonth + 1}`);
      const data = {};
      res.data.forEach(r => { data[r.date] = r.rating; });
      setRatings(data);
    } catch (error) {
      console.error('fetchUserRatings error:', error);
    }
  };

  const fetchUserStats = async () => {
    if (!viewingUser) return;
    try {
      const res = await API.get(`/users/${viewingUser.id}/profile`);
      setStats({ avgRating: res.data.stats.avgRating || 0, totalDays: res.data.stats.totalDays || 0 });
    } catch (error) {
      console.error('fetchUserStats error:', error);
    }
  };

  const fetchUserProgress = async () => {
    if (!viewingUser) return;
    try {
      const res = await API.get(`/users/${viewingUser.id}/progress`);
      setViewingUserProgress(res.data);
    } catch (error) {
      console.error('fetchUserProgress error:', error);
    }
  };

  // ПОИСК ПОЛЬЗОВАТЕЛЕЙ - только при вводе минимум 2 символов
  const searchUsers = async (query) => {
    if (query.length < 2) {
      setUsers([]);
      return;
    }
    try {
      const res = await API.get(`/users/search?q=${encodeURIComponent(query)}`);
      setUsers(res.data);
    } catch (error) {
      console.error('searchUsers error:', error);
      setUsers([]);
    }
  };

  const saveRating = async (date, rating) => {
    if (!token || isViewingOther) return;
    try {
      await API.post('/ratings/rate', { date, rating });
      fetchRatings();
      fetchStats();
      
      if (canGetPoint()) {
        const newPoints = points + 1;
        const newLevel = Math.floor(newPoints / 30) + 1;
        const nowISO = new Date().toISOString();
        
        setPoints(newPoints);
        setLevel(newLevel);
        setLastRatedDate(nowISO);
        await saveProgressToServer(newPoints, newLevel, nowISO);
      }
      
      setSelectedDate(null);
      setSliderValue(3);
    } catch (error) {
      console.error('saveRating error:', error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await API.post('/auth/login', { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setUser(res.data.user);
      API.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      await loadProgressFromServer();
      setUsername('');
      setPassword('');
    } catch (error) {
      alert(`Ошибка: ${error.response?.data?.error || error.message || 'Ошибка входа'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await API.post('/auth/register', { username, password });
      alert('Регистрация успешна! Теперь войдите.');
      setIsLogin(true);
      setUsername('');
      setPassword('');
    } catch (error) {
      alert(`Ошибка: ${error.response?.data?.error || error.message || 'Ошибка регистрации'}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleChangeUsername = async () => {
    if (!newUsername.trim()) return;
    setChangingName(true);
    try {
      const res = await API.put('/user/profile', { username: newUsername, avatar: user?.avatar });
      if (res.data.success) {
        const updatedUser = { ...user, username: newUsername };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        setShowChangeUsername(false);
        setNewUsername('');
        alert('Имя пользователя изменено!');
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Ошибка при изменении имени');
    } finally {
      setChangingName(false);
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  
  const confirmLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setViewingUser(null);
    setIsViewingOther(false);
    setShowLogoutConfirm(false);
  };

  const handleViewUser = (selectedUser) => {
    setViewingUser(selectedUser);
    setIsViewingOther(true);
    setShowUserList(false);
    setSearchQuery('');
    setUsers([]);
    setView('calendar');
  };

  const handleBackToMyProfile = () => {
    setIsViewingOther(false);
    setViewingUser(null);
    setViewingUserProgress(null);
    fetchRatings();
    fetchStats();
  };

  const getRatingLabel = (value) => {
    if (value === 0.5) return 'Ужасно';
    if (value === 1) return 'Плохо';
    if (value === 1.5) return 'Не очень';
    if (value === 2) return 'Средне';
    if (value === 2.5) return 'Нормально';
    if (value === 3) return 'Хорошо';
    if (value === 3.5) return 'Очень хорошо';
    if (value === 4) return 'Отлично';
    if (value === 4.5) return 'Превосходно';
    return 'Шедевр';
  };

  if (!token) {
    return (
      <div style={styles.authPage}>
        <div style={styles.authCard}>
          <div style={styles.authLogo}>◆</div>
          <h1 style={styles.authTitle}>DayTrack</h1>
          <p style={styles.authSubtitle}>Оценивайте каждый день</p>
          <form onSubmit={isLogin ? handleLogin : handleRegister}>
            <input
              type="text"
              style={styles.authInput}
              placeholder="Имя пользователя"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
            <input
              type="password"
              style={styles.authInput}
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <button type="submit" style={styles.authBtn} disabled={loading}>
              {loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Создать аккаунт')}
            </button>
          </form>
          <button style={styles.authSwitch} onClick={() => setIsLogin(!isLogin)} disabled={loading}>
            {isLogin ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
          </button>
        </div>
      </div>
    );
  }

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
  };
  
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const days = [];
  
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} style={styles.dayCell}></div>);
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rating = ratings[date];
    const fillHeight = rating ? (rating / 5) * 100 : 0;
    
    days.push(
      <div key={day} style={styles.dayCell}>
        <button 
          style={styles.dayButton} 
          onClick={() => !isViewingOther && setSelectedDate({ date, rating: rating || 0 })}
          disabled={isViewingOther}
        >
          <div style={{ ...styles.fillBar, height: `${fillHeight}%` }}></div>
          <span style={styles.dayNumber}>{day}</span>
          {rating !== undefined && <span style={styles.dayRating}>{rating}</span>}
        </button>
      </div>
    );
  }

  const currentPoints = isViewingOther ? (viewingUserProgress?.points || 0) : points;
  const currentLevel = isViewingOther ? (viewingUserProgress?.level || 1) : level;

  return (
    <div style={styles.app}>
      {showLogoutConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalTitle}>Выход из аккаунта</div>
            <div style={styles.modalText}>Вы уверены, что хотите выйти?</div>
            <div style={styles.modalButtons}>
              <button style={{ ...styles.modalBtn, background: '#ef4444' }} onClick={confirmLogout}>Да, выйти</button>
              <button style={{ ...styles.modalBtn, background: '#1a1a1a' }} onClick={() => setShowLogoutConfirm(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
      
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>◆</span>
          <span style={styles.logoText}>DayTrack</span>
        </div>
        <div style={styles.userInfo}>
          <span style={styles.userName}>{user?.username}</span>
        </div>
      </div>

      {/* Блок очков и таймеров */}
      <div style={styles.pointsCard}>
        <div style={styles.pointsHeader}>
          <div style={styles.pointsLevel}>
            <span style={styles.levelNumber}>Уровень {currentLevel}</span>
            <span style={styles.pointsCount}>{currentPoints} очков</span>
          </div>
          <div style={styles.pointsProgress}>
            <div style={{ ...styles.pointsProgressBar, width: `${(currentPoints % 30) / 30 * 100}%` }}></div>
          </div>
        </div>
        
        <div style={styles.timerContainer}>
          {!canGetPoint() && !isViewingOther ? (
            <div style={styles.timerBox}>
              <span style={styles.timerLabel}>✅ Вы уже получили очко сегодня!</span>
              <span style={styles.timerLabelSmall}>Следующее очко можно получить через:</span>
              <span style={styles.timerValue}>{nextPointTimer ? formatTime(nextPointTimer) : '--:--:--'}</span>
            </div>
          ) : !isViewingOther ? (
            <div style={styles.timerBoxWarning}>
              <span style={styles.timerLabel}>⚠️ Вы можете получить очко до:</span>
              <span style={styles.timerValue}>{nextPointTimer ? formatTime(nextPointTimer) : '--:--:--'}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div style={styles.navBar}>
        <button style={{ ...styles.navItem, ...(view === 'calendar' ? styles.navItemActive : {}) }} onClick={() => setView('calendar')}>
          <span>📅</span>
          <span>Календарь</span>
        </button>
        <button style={{ ...styles.navItem, ...(view === 'stats' ? styles.navItemActive : {}) }} onClick={() => setView('stats')}>
          <span>📊</span>
          <span>Статистика</span>
        </button>
        <button style={styles.navItem} onClick={() => setShowUserList(true)}>
          <span>👥</span>
          <span>Люди</span>
        </button>
        <button style={styles.navItemLogout} onClick={handleLogout}>
          <span>🚪</span>
          <span>Выход</span>
        </button>
      </div>

      {/* Список пользователей - показываем только при поиске */}
      {showUserList && (
        <div style={styles.modalOverlay} onClick={() => setShowUserList(false)}>
          <div style={styles.userListModal} onClick={e => e.stopPropagation()}>
            <div style={styles.userListHeader}>
              <h3 style={styles.userListTitle}>Поиск пользователей</h3>
              <button style={styles.closeBtn} onClick={() => setShowUserList(false)}>✕</button>
            </div>
            <input
              type="text"
              style={styles.searchInput}
              placeholder="Введите имя для поиска (минимум 2 символа)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                searchUsers(e.target.value);
              }}
            />
            <div style={styles.userListItems}>
              {searchQuery.length >= 2 ? (
                users.length > 0 ? (
                  users.map(u => (
                    <button key={u.id} style={styles.userListItem} onClick={() => handleViewUser(u)}>
                      <span style={styles.userListAvatar}>{u.avatar || '◆'}</span>
                      <div style={styles.userListInfo}>
                        <span style={styles.userListNameWhite}>{u.username}</span>
                        <div style={styles.userListLevelBadge}>
                          <span style={styles.userListLevelIcon}>🏆</span>
                          <span style={styles.userListLevelText}>Уровень {u.level || 1}</span>
                          <span style={styles.userListPointsText}>({u.points || 0} очков)</span>
                        </div>
                      </div>
                      <span style={styles.userListArrow}>→</span>
                    </button>
                  ))
                ) : (
                  <div style={styles.noUsers}>Пользователи не найдены</div>
                )
              ) : (
                <div style={styles.noUsers}>Введите минимум 2 символа для поиска</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={styles.content}>
        {view === 'calendar' && (
          <div style={styles.calendarWrapper}>
            <div style={styles.calendarContainer}>
              <div style={styles.calendarHeader}>
                <button style={styles.monthNavBtn} onClick={() => setCurrentYear(y => y - 1)}>‹‹</button>
                <button style={styles.monthNavBtn} onClick={() => setCurrentMonth(m => m === 0 ? (setCurrentYear(y => y - 1), 11) : m - 1)}>‹</button>
                <div style={styles.currentDate}>
                  <div style={styles.currentMonthYear}>{new Date(currentYear, currentMonth).toLocaleString('ru', { month: 'long' })}</div>
                  <div style={styles.currentYear}>{currentYear}</div>
                </div>
                <button style={styles.monthNavBtn} onClick={() => setCurrentMonth(m => m === 11 ? (setCurrentYear(y => y + 1), 0) : m + 1)}>›</button>
                <button style={styles.monthNavBtn} onClick={() => setCurrentYear(y => y + 1)}>››</button>
              </div>
              
              <div style={styles.weekdays}>
                {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => <div key={d} style={styles.weekday}>{d}</div>)}
              </div>
              
              <div style={styles.calendarGrid}>{days}</div>
              
              {isViewingOther && (
                <div style={styles.viewingNotice}>
                  Просмотр пользователя {viewingUser?.username}
                  <button style={styles.backToMyBtn} onClick={handleBackToMyProfile}>Вернуться</button>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'stats' && (
          <div style={styles.statsPage}>
            {/* Профиль с уровнем */}
            <div style={styles.statsProfile}>
              <div style={styles.statsAvatar}>{user?.avatar || '◆'}</div>
              <div style={styles.statsUserName}>{isViewingOther ? viewingUser?.username : user?.username}</div>
              
              <div style={styles.statsLevelContainer}>
                <div style={styles.statsLevelHeader}>
                  <span style={styles.statsLevelIcon}>🏆</span>
                  <span style={styles.statsLevelText}>Уровень {currentLevel}</span>
                  <span style={styles.statsPointsText}>{currentPoints} очков</span>
                </div>
                <div style={styles.statsProgressBar}>
                  <div style={{ ...styles.statsProgressFill, width: `${(currentPoints % 30) / 30 * 100}%` }}></div>
                </div>
                <div style={styles.statsProgressLabel}>
                  {30 - (currentPoints % 30)} очков до следующего уровня
                </div>
              </div>
              
              {!isViewingOther && (
                <button style={styles.changeUsernameBtn} onClick={() => setShowChangeUsername(true)}>
                  Изменить имя
                </button>
              )}
            </div>
            
            {showChangeUsername && !isViewingOther && (
              <div style={styles.modalOverlay} onClick={() => setShowChangeUsername(false)}>
                <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                  <div style={styles.modalTitle}>Изменить имя</div>
                  <input
                    type="text"
                    style={styles.authInput}
                    placeholder="Новое имя"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                  />
                  <div style={styles.modalButtons}>
                    <button style={{ ...styles.modalBtn, background: '#22c55e' }} onClick={handleChangeUsername} disabled={changingName}>
                      {changingName ? 'Сохранение...' : 'Сохранить'}
                    </button>
                    <button style={{ ...styles.modalBtn, background: '#1a1a1a' }} onClick={() => setShowChangeUsername(false)}>Отмена</button>
                  </div>
                </div>
              </div>
            )}
            
            <div style={styles.statsCards}>
              <div style={styles.statCard}>
                <div style={styles.statIcon}>⭐</div>
                <div style={styles.statValue}>{stats.avgRating.toFixed(1)}</div>
                <div style={styles.statLabel}>Средняя оценка</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statIcon}>📆</div>
                <div style={styles.statValue}>{stats.totalDays}</div>
                <div style={styles.statLabel}>Дней оценено</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statIcon}>💎</div>
                <div style={styles.statValue}>{currentPoints}</div>
                <div style={styles.statLabel}>Всего очков</div>
              </div>
            </div>
            
            <div style={styles.infoBox}>
              <div style={styles.infoTitle}>📈 Система уровней</div>
              <div style={styles.infoText}>30 очков = 1 уровень</div>
              <div style={styles.infoTextSmall}>За пропуск дня -5 очков</div>
              <div style={styles.infoTextSmall}>За пропуск 2+ дней - сброс до 0</div>
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно со слайдером */}
      {selectedDate && !isViewingOther && (
        <div style={styles.modalOverlay} onClick={() => setSelectedDate(null)}>
          <div style={styles.sliderModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalDate}>Оценка за {selectedDate.date}</div>
            
            <div style={styles.sliderContainer}>
              <div style={styles.sliderValueDisplay}>
                <span style={styles.sliderValueNumber}>{sliderValue}</span>
                <span style={styles.sliderValueLabel}>{getRatingLabel(sliderValue)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={sliderValue}
                onChange={(e) => setSliderValue(parseFloat(e.target.value))}
                style={styles.slider}
              />
              <div style={styles.sliderMarks}>
                <span>0.5</span><span>1</span><span>1.5</span><span>2</span><span>2.5</span>
                <span>3</span><span>3.5</span><span>4</span><span>4.5</span><span>5</span>
              </div>
            </div>
            
            <div style={styles.sliderButtons}>
              <button style={styles.sliderSaveBtn} onClick={() => saveRating(selectedDate.date, sliderValue)}>
                Сохранить оценку {canGetPoint() && '(+1 очко)'}
              </button>
              <button style={styles.sliderResetBtn} onClick={() => saveRating(selectedDate.date, 0)}>
                Сбросить
              </button>
              <button style={styles.sliderCloseBtn} onClick={() => setSelectedDate(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    minHeight: '100vh',
    background: '#0a0a0a',
    color: '#e0e0e0',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    paddingBottom: '80px'
  },
  
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    background: '#0d0d0d',
    borderBottom: '1px solid #1a1a1a',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  logo: { fontSize: '24px', color: '#22c55e' },
  logoText: { fontSize: '18px', fontWeight: 600, color: '#e0e0e0' },
  userInfo: { display: 'flex', alignItems: 'center' },
  userName: { fontSize: '14px', color: '#22c55e', background: '#1a2a1a', padding: '6px 12px', borderRadius: '20px' },
  
  pointsCard: {
    margin: '12px 16px',
    padding: '16px',
    background: '#0d0d0d',
    border: '1px solid #22c55e',
    borderRadius: '12px',
  },
  pointsHeader: { textAlign: 'center', marginBottom: '12px' },
  pointsLevel: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' },
  levelNumber: { fontSize: '20px', fontWeight: 'bold', color: '#22c55e' },
  pointsCount: { fontSize: '24px', fontWeight: 'bold', color: '#e0e0e0' },
  pointsProgress: { height: '8px', background: '#1a1a1a', borderRadius: '4px', overflow: 'hidden' },
  pointsProgressBar: { height: '100%', background: '#22c55e', borderRadius: '4px', transition: 'width 0.3s ease' },
  timerContainer: { marginTop: '12px', textAlign: 'center' },
  timerBox: { padding: '10px', background: '#1a2a1a', borderRadius: '8px' },
  timerBoxWarning: { padding: '10px', background: '#2a1a1a', borderRadius: '8px' },
  timerLabel: { fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' },
  timerLabelSmall: { fontSize: '10px', color: '#666', display: 'block', marginBottom: '4px' },
  timerValue: { fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: '#22c55e' },
  
  navBar: {
    display: 'flex',
    gap: '4px',
    padding: '10px 16px',
    background: '#0d0d0d',
    borderBottom: '1px solid #1a1a1a',
    position: 'sticky',
    top: '60px',
    zIndex: 99,
  },
  navItem: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 8px',
    background: 'transparent',
    border: 'none',
    color: '#666',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: '8px',
  },
  navItemActive: { background: '#1a1a1a', color: '#22c55e' },
  navItemLogout: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 8px',
    background: 'transparent',
    border: 'none',
    color: '#ef4444',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: '8px',
  },
  
  content: { padding: '16px' },
  
  calendarWrapper: { overflowX: 'auto' },
  calendarContainer: {
    background: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: '12px',
    padding: '16px',
    minWidth: '320px',
  },
  calendarHeader: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  monthNavBtn: { background: '#1a1a1a', border: 'none', color: '#888', padding: '8px 12px', fontSize: '14px', cursor: 'pointer', borderRadius: '8px' },
  currentDate: { textAlign: 'center', minWidth: '100px' },
  currentMonthYear: { fontSize: '14px', fontWeight: 600, textTransform: 'capitalize' },
  currentYear: { fontSize: '11px', color: '#666' },
  weekdays: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #1a1a1a' },
  weekday: { textAlign: 'center', fontSize: '10px', fontWeight: 600, color: '#555' },
  calendarGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(40px, 1fr))', gap: '4px' },
  dayCell: { aspectRatio: '1' },
  dayButton: { position: 'relative', width: '100%', height: '100%', background: '#0d0d0d', border: '1px solid #1a1a1a', cursor: 'pointer', overflow: 'hidden', borderRadius: '6px', transition: 'all 0.2s' },
  fillBar: { position: 'absolute', bottom: 0, left: 0, width: '100%', background: '#22c55e', opacity: 0.25, transition: 'height 0.3s ease' },
  dayNumber: { position: 'absolute', top: '4px', left: '6px', fontSize: '11px', fontWeight: 500, zIndex: 1, color: '#c0c0c0' },
  dayRating: { position: 'absolute', bottom: '2px', right: '4px', fontSize: '9px', fontWeight: 600, color: '#22c55e', zIndex: 1 },
  
  statsPage: { maxWidth: '500px', margin: '0 auto' },
  statsProfile: { textAlign: 'center', marginBottom: '24px', padding: '16px', background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '12px' },
  statsAvatar: { fontSize: '48px', marginBottom: '8px' },
  statsUserName: { fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: '#e0e0e0' },
  
  statsLevelContainer: { marginBottom: '16px', padding: '12px', background: '#1a1a1a', borderRadius: '8px' },
  statsLevelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  statsLevelIcon: { fontSize: '16px' },
  statsLevelText: { fontSize: '14px', fontWeight: 'bold', color: '#22c55e' },
  statsPointsText: { fontSize: '12px', color: '#888' },
  statsProgressBar: { height: '6px', background: '#2a2a2a', borderRadius: '3px', overflow: 'hidden' },
  statsProgressFill: { height: '100%', background: '#22c55e', borderRadius: '3px', transition: 'width 0.3s ease' },
  statsProgressLabel: { fontSize: '10px', color: '#666', marginTop: '6px' },
  
  changeUsernameBtn: { background: 'transparent', border: '1px solid #22c55e', color: '#22c55e', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' },
  statsCards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' },
  statCard: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '12px', padding: '16px 12px', textAlign: 'center' },
  statIcon: { fontSize: '28px', marginBottom: '8px' },
  statValue: { fontSize: '28px', fontWeight: 700, color: '#22c55e' },
  statLabel: { fontSize: '10px', color: '#666', marginTop: '4px' },
  infoBox: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '12px', padding: '16px', textAlign: 'center', marginBottom: '12px' },
  infoTitle: { fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: '#888' },
  infoText: { fontSize: '11px', color: '#555' },
  infoTextSmall: { fontSize: '10px', color: '#444', marginTop: '4px' },
  
  // Стили для списка пользователей
  userListModal: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '16px', width: '90%', maxWidth: '400px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  userListHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #1a1a1a' },
  userListTitle: { fontSize: '16px', fontWeight: 600, margin: 0, color: '#e0e0e0' },
  closeBtn: { background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' },
  searchInput: { background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '12px', margin: '12px', color: '#e0e0e0', fontSize: '14px' },
  userListItems: { flex: 1, overflowY: 'auto', padding: '0 12px 12px' },
  userListItem: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', background: 'transparent', border: '1px solid #1a1a1a', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer' },
  userListAvatar: { fontSize: '28px' },
  userListInfo: { flex: 1, textAlign: 'left' },
  userListNameWhite: { fontSize: '14px', color: '#ffffff', fontWeight: 500, display: 'block', marginBottom: '4px' },
  userListLevelBadge: { display: 'flex', alignItems: 'center', gap: '6px' },
  userListLevelIcon: { fontSize: '10px' },
  userListLevelText: { fontSize: '10px', color: '#22c55e' },
  userListPointsText: { fontSize: '9px', color: '#666' },
  userListArrow: { color: '#22c55e', fontSize: '16px' },
  noUsers: { textAlign: 'center', color: '#666', padding: '32px' },
  
  viewingNotice: { marginTop: '16px', textAlign: 'center', fontSize: '12px', color: '#22c55e', padding: '10px', background: '#1a2a1a', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backToMyBtn: { background: '#22c55e', border: 'none', color: '#0a0a0a', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' },
  
  authPage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: '20px' },
  authCard: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '16px', padding: '32px 24px', width: '100%', maxWidth: '340px', textAlign: 'center' },
  authLogo: { fontSize: '48px', color: '#22c55e', marginBottom: '16px' },
  authTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px', color: '#e0e0e0' },
  authSubtitle: { fontSize: '13px', color: '#666', marginBottom: '28px' },
  authInput: { width: '100%', padding: '12px', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '10px', color: '#e0e0e0', fontSize: '14px', marginBottom: '12px' },
  authBtn: { width: '100%', padding: '12px', background: '#22c55e', color: '#0a0a0a', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginTop: '8px' },
  authSwitch: { width: '100%', padding: '10px', background: 'transparent', border: '1px solid #1a1a1a', borderRadius: '10px', color: '#666', fontSize: '13px', cursor: 'pointer', marginTop: '12px' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '320px', textAlign: 'center' },
  sliderModalContent: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '340px', textAlign: 'center' },
  modalTitle: { fontSize: '18px', fontWeight: 600, marginBottom: '16px' },
  modalText: { fontSize: '14px', color: '#888', marginBottom: '20px' },
  modalButtons: { display: 'flex', gap: '12px', marginTop: '20px' },
  modalBtn: { flex: 1, padding: '12px', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', color: 'white' },
  modalDate: { fontSize: '16px', color: '#888', marginBottom: '20px' },
  
  sliderContainer: { marginBottom: '24px' },
  sliderValueDisplay: { textAlign: 'center', marginBottom: '16px' },
  sliderValueNumber: { fontSize: '42px', fontWeight: 'bold', color: '#22c55e', display: 'block' },
  sliderValueLabel: { fontSize: '14px', color: '#888', marginTop: '4px', display: 'block' },
  slider: { width: '100%', height: '4px', WebkitAppearance: 'none', background: '#1a1a1a', borderRadius: '2px', outline: 'none' },
  sliderMarks: { display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '9px', color: '#555' },
  sliderButtons: { display: 'flex', flexDirection: 'column', gap: '8px' },
  sliderSaveBtn: { width: '100%', padding: '12px', background: '#22c55e', border: 'none', borderRadius: '8px', color: '#0a0a0a', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  sliderResetBtn: { width: '100%', padding: '10px', background: '#1a1a1a', border: 'none', borderRadius: '8px', color: '#888', fontSize: '13px', cursor: 'pointer' },
  sliderCloseBtn: { width: '100%', padding: '10px', background: 'transparent', border: '1px solid #1a1a1a', borderRadius: '8px', color: '#666', fontSize: '13px', cursor: 'pointer' },
};

export default App;