(function () {
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function rankColor(r) { return {'S+':'#ff66db',X:'#ff6666',S:'#ffd700',A:'#a0e060',B:'#60b0ff',C:'#ffaa44',D:'#ff5555'}[r]||'#fff'; }

  // เวลาแบบสัมพัทธ์ (เช่น "6 เดือนที่แล้ว") สำหรับแสดงในรายการคะแนน
  function timeAgoTH(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const MIN = 60000, HR = 3600000, DAY = 86400000, MONTH = DAY * 30, YEAR = DAY * 365;
    if (diff < MIN)   return 'เมื่อสักครู่';
    if (diff < HR)    return Math.floor(diff / MIN) + ' นาทีที่แล้ว';
    if (diff < DAY)   return Math.floor(diff / HR) + ' ชั่วโมงที่แล้ว';
    if (diff < MONTH) return Math.floor(diff / DAY) + ' วันที่แล้ว';
    if (diff < YEAR)  return Math.floor(diff / MONTH) + ' เดือนที่แล้ว';
    return Math.floor(diff / YEAR) + ' ปีที่แล้ว';
  }


  // ── Shared PP / Level helpers ──────────────────────────────────────────────
  window.GamePP = {
    // pp = ค่าวัดฝีมือ (skill stat) ไม่ผูกกับ Lv. — เหมือน pp ของ osu! จริงที่แยกจาก Level
    calcScorePP(s) {
      const acc   = (s.accuracy || 0) / 100;
      const combo = s.maxCombo || 1;
      return Math.round(Math.pow(acc, 6) * Math.pow(combo, 0.5) * 1.0);
    },
    calcTotalPP(scores) {
      const sorted = scores.map(s => this.calcScorePP(s)).sort((a,b) => b - a);
      return Math.round(sorted.reduce((sum, pp, i) => sum + pp * Math.pow(0.95, i), 0));
    },

    // ── Level curve: สูตรเดียวกับ osu! จริง (total score formula จากวิกิ osu!) ──
    //   score(n) = 5000/3 * (4n³ - 3n² - n) + 1.25 * 1.8^(n-60)
    // ของจริง osu! ใช้กับ total score สเกลพันล้าน ซึ่งคนละสเกลกับคะแนนต่อโน้ตของเรา
    // (PERFECT = 320/โน้ต) เลย normalize ใหม่ให้ Lv.100 = LEVEL_100_SCORE แทน แต่
    // "สัดส่วน" ความยากระหว่างเลเวลเหมือนของจริงทุกอย่าง -> ช่วงต้นขึ้นไว ช่วงท้ายโต
    // แบบ exponential ขึ้นยากขึ้นเรื่อยๆ จนเกือบเป็นไปไม่ได้ที่ Lv.100 เหมือน osu! จริง
    //
    // Lv. คิดจาก "lifetimeScore" (คะแนนสะสมทุกครั้งที่เล่น นับแม้ fail/ไม่ใช่ best ใหม่)
    
    LEVEL_100_SCORE: 1_000_000_000,
    _osuRawScore(lv) {
      return (5000 / 3) * (4 * lv ** 3 - 3 * lv ** 2 - lv) + 1.25 * Math.pow(1.8, lv - 60);
    },
    _scoreForLevel(lv) {
      if (lv <= 1) return 0;
      return this.LEVEL_100_SCORE * (this._osuRawScore(lv) / this._osuRawScore(100));
    },
    levelFromTotalScore(totalScore) {
      let lv = 1;
      while (lv < 100 && totalScore >= this._scoreForLevel(lv + 1)) lv++;
      return lv;
    },
    progressFromTotalScore(totalScore) {
      const lv = this.levelFromTotalScore(totalScore);
      if (lv >= 100) return 100;
      const cur  = this._scoreForLevel(lv);
      const next = this._scoreForLevel(lv + 1);
      return ((totalScore - cur) / (next - cur)) * 100;
    },
  };

  
  window.refreshNavLevel = async function() {
    if (!window.Auth || !Auth.user) return;
    try {
      const lifetimeScore = await Auth.fetchLifetimeScore(Auth.user.uid);
      const level = GamePP.levelFromTotalScore(lifetimeScore);
      const chip  = document.getElementById('navLevelChip');
      if (chip) chip.textContent = 'Lv.' + level;
    } catch(e) {}
  };

  
  
  
  window.showPPGainToast = async function(newScoreData) {
    if (!window.Auth || !Auth.user || !window.GamePP) return;
    try {
      const isBest = !!newScoreData.isBest;
      const scores  = await Auth.fetchMyScores();
      const ppAfter = GamePP.calcTotalPP(scores);

      
      
      let ppGain = 0;
      if (isBest) {
        const newScorePP = newScoreData.scorePP ?? GamePP.calcScorePP(newScoreData);
        const otherScores = scores.filter(s => GamePP.calcScorePP(s) !== newScorePP);
        const ppBefore = GamePP.calcTotalPP(
          otherScores.length < scores.length ? otherScores : scores.slice(1)
        );
        ppGain = ppAfter - ppBefore;
      }

      
      
      const lifetimeScoreAfter  = newScoreData.lifetimeScoreAfter ?? 0;
      const lifetimeScoreBefore = lifetimeScoreAfter - (newScoreData.scoreGained || 0);
      const lvBefore = GamePP.levelFromTotalScore(lifetimeScoreBefore);
      const lvAfter  = GamePP.levelFromTotalScore(lifetimeScoreAfter);
      const levelUp  = lvAfter > lvBefore;

      
      const chip = document.getElementById('navLevelChip');
      if (chip) chip.textContent = 'Lv.' + lvAfter;

      
      if (!isBest && !levelUp) return;

      
      let toast = document.getElementById('ppGainToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ppGainToast';
        document.body.appendChild(toast);
      }
      toast.className = 'pp-gain-toast' + (levelUp ? ' level-up' : '');

      const ppSegment = isBest
        ? `<span class="pgt-pp">+${ppGain}pp</span><span class="pgt-sep">·</span>`
        : '';

      if (levelUp) {
        toast.innerHTML = `
          ${ppSegment}
          <span class="pgt-level">LEVEL UP <strong>Lv.${lvAfter}</strong> <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;color:#ffe066;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
        `;
      } else {
        toast.innerHTML = `
          ${ppSegment}
          <span class="pgt-total">${ppAfter.toLocaleString()}pp total · Lv.${lvAfter}</span>
        `;
      }

      // animate in
      toast.classList.remove('pgt-show', 'pgt-hide');
      void toast.offsetWidth;
      toast.classList.add('pgt-show');
      clearTimeout(toast._hideTimer);
      toast._hideTimer = setTimeout(() => {
        toast.classList.add('pgt-hide');
      }, 4000);
    } catch(e) {}
  };

  
  
  
  


  

  function rankColor2(r) {
    return {'S+':'#ff66db',X:'#ff6666',S:'#ffd700',A:'#a0e060',B:'#60b0ff',C:'#ffaa44',D:'#ff5555'}[r]||'#fff';
  }

  function openScoreDetail(opts) {
    
    const modal = document.getElementById('scoreDetailModal');
    const backdrop = document.getElementById('scoreDetailBackdrop');
    if (!modal || !backdrop) return;

    
    document.getElementById('sdSongName').textContent = opts.songId || '—';
    const rankEl = document.getElementById('sdRank');
    rankEl.textContent = opts.rank || '—';
    rankEl.style.color = rankColor2(opts.rank);
    document.getElementById('sdScore').textContent = String(opts.score || 0).padStart(6, '0');
    document.getElementById('sdAcc').textContent = opts.accuracy != null ? 'Accuracy ' + opts.accuracy.toFixed(2) + '%' : '—';
    document.getElementById('sdCombo').textContent = opts.maxCombo != null ? 'Max Combo ' + opts.maxCombo + 'x' : '—';

    const jc = opts.judgeCounts || {};
    document.querySelector('#sdPerfect .sdj-val').textContent = jc.PERFECT ?? '—';
    document.querySelector('#sdGreat .sdj-val').textContent   = jc.GREAT   ?? '—';
    document.querySelector('#sdGood .sdj-val').textContent    = jc.GOOD    ?? '—';
    document.querySelector('#sdBad .sdj-val').textContent     = jc.BAD     ?? '—';
    document.querySelector('#sdMiss .sdj-val').textContent    = jc.MISS    ?? '—';
    const dateEl = document.querySelector('#sdDate .sdj-val');
    if (opts.ts) {
      const d = new Date(opts.ts);
      dateEl.textContent = d.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' });
    } else {
      dateEl.textContent = '—';
    }

    
    const btnPlay = document.getElementById('sdBtnPlay');
    if (btnPlay) {
      if (opts.showPlay && opts.songId && window._openSongByTitle) {
        btnPlay.style.display = 'block';
        btnPlay.onclick = () => {
          closeScoreDetail();
          window._openSongByTitle(opts.songId, opts.beatmapSetId || null);
        };
      } else {
        btnPlay.style.display = 'none';
      }
    }

    
    const btnProfile = document.getElementById('sdBtnProfile');
    if (btnProfile) {
      if (opts.showProfile && opts.uid) {
        btnProfile.style.display = 'block';
        btnProfile.onclick = () => {
          closeScoreDetail();
          if (window._openFriendProfile) window._openFriendProfile(opts.uid, opts.displayName, opts.photoURL);
        };
      } else {
        btnProfile.style.display = 'none';
      }
    }

    backdrop.style.display = 'block';
    modal.style.display = 'flex';
  }

  function closeScoreDetail() {
    const modal = document.getElementById('scoreDetailModal');
    const backdrop = document.getElementById('scoreDetailBackdrop');
    if (modal) modal.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
  }

  window._openScoreDetail = openScoreDetail;
  window._closeScoreDetail = closeScoreDetail;

  document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('btnCloseScoreDetail');
    const backdrop = document.getElementById('scoreDetailBackdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeScoreDetail);
    if (backdrop) backdrop.addEventListener('click', closeScoreDetail);
  });

  document.addEventListener('DOMContentLoaded', () => {

    const btnProfile = document.getElementById('btnProfile');
    if (btnProfile) {
      btnProfile.style.display = 'none';
      btnProfile.addEventListener('click', () => openProfile(null));
    }

    
    function openProfile(target) {
      const me = window.Auth && Auth.user;
      const isSelf = !target;
      if (isSelf && !me) return;

      const viewUser = isSelf
        ? { uid: me.uid, displayName: me.displayName, email: me.email, photoURL: me.photoURL }
        : { uid: target.uid, displayName: target.displayName, email: '', photoURL: target.photoURL };

      // avatar + name
      const avatarEl = document.getElementById('profileAvatar');
      const nameEl   = document.getElementById('profileName');
      const emailEl  = document.getElementById('profileEmail');
      const bannerEl = document.getElementById('profileBanner');
      const badgeEl  = document.getElementById('profileBadge');
      const uploadBtn = document.getElementById('profileBannerUploadBtn');
      const avatarUploadBtn = document.getElementById('profileAvatarUploadBtn');

      if (nameEl)  nameEl.textContent  = viewUser.displayName || 'ไม่ระบุชื่อ';
      if (emailEl) emailEl.textContent = viewUser.email || (isSelf ? '' : 'โปรไฟล์');
      if (badgeEl) badgeEl.lastChild.textContent = isSelf ? ' Player' : ' Player';
      if (avatarUploadBtn) avatarUploadBtn.style.display = isSelf ? '' : 'none';
      if (uploadBtn) uploadBtn.style.display = isSelf ? '' : 'none';

      
      
      if (avatarEl) {
        if (viewUser.photoURL) {
          avatarEl.innerHTML = `<img src="${esc(viewUser.photoURL)}" referrerpolicy="no-referrer">`;
        } else {
          avatarEl.innerHTML = '';
          avatarEl.textContent = (viewUser.displayName||'?')[0].toUpperCase();
        }
      }
      if (bannerEl) {
        bannerEl.style.backgroundImage = '';
        bannerEl.classList.remove('has-bg-image');
      }

      if (window.Auth && viewUser.uid) {
        Auth.fetchProfileImage(viewUser.uid, 'avatar').then(url => {
          if (url && avatarEl) avatarEl.innerHTML = `<img src="${esc(url)}">`;
        });
        Auth.fetchProfileImage(viewUser.uid, 'banner').then(url => {
          if (url && bannerEl) {
            bannerEl.style.backgroundImage = `url('${esc(url)}')`;
            bannerEl.style.backgroundSize = 'cover';
            bannerEl.style.backgroundPosition = 'center';
            bannerEl.classList.add('has-bg-image');
          }
        });
      }

      
      const bannerInput = document.getElementById('profileBannerInput');
      if (bannerInput && isSelf) {
        bannerInput.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            alert('ไฟล์รูปใหญ่เกินไป (จำกัด 5MB)');
            bannerInput.value = '';
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            // แสดงผลทันทีก่อน (optimistic) แล้วค่อยอัพโหลดขึ้น server เบื้องหลัง
            if (bannerEl) {
              bannerEl.style.backgroundImage = `url('${dataUrl}')`;
              bannerEl.style.backgroundSize = 'cover';
              bannerEl.style.backgroundPosition = 'center';
              bannerEl.classList.add('has-bg-image');
            }
            Auth.uploadProfileImage('banner', dataUrl).then(result => {
              if (!result || !result.saved) {
                alert('อัพโหลดแบนเนอร์ไม่สำเร็จ ลองใหม่อีกครั้ง');
              }
            });
          };
          reader.readAsDataURL(file);
          bannerInput.value = '';
        };
      }

      // Avatar upload handler (เฉพาะตัวเอง) — อัพโหลดขึ้น server เพื่อให้ทุกคนเห็นรูปเดียวกัน
      const avatarInput = document.getElementById('profileAvatarInput');
      if (avatarInput && isSelf) {
        avatarInput.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            alert('ไฟล์รูปใหญ่เกินไป (จำกัด 5MB)');
            avatarInput.value = '';
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            if (avatarEl) avatarEl.innerHTML = `<img src="${esc(dataUrl)}">`;
            // อัปเดตรูปใน header ทันที ไม่ต้องรอ server
            if (Auth.refreshHeaderAvatar) Auth.refreshHeaderAvatar(viewUser.uid, dataUrl);
            Auth.uploadProfileImage('avatar', dataUrl).then(result => {
              if (!result || !result.saved) {
                alert('อัพโหลด avatar ไม่สำเร็จ ลองใหม่อีกครั้ง');
              } else {
                
                if (Auth.clearServerAvatarCache) Auth.clearServerAvatarCache(viewUser.uid);
              }
            });
          };
          reader.readAsDataURL(file);
          avatarInput.value = '';
        };
      }

      // open modal + reset to scores tab — ใช้ฟังก์ชันจริงจาก app.js (จัดการ MP stashing/navigation ให้ถูกต้อง)
      if (window._openProfileModal) window._openProfileModal();

      // load scores + compute stats
      const listEl = document.getElementById('profileScoreList');
      if (listEl) listEl.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:12px;">กำลังโหลด...</div>';

      const scoresPromise = isSelf ? Auth.fetchMyScores() : Auth.fetchScoresForUid(viewUser.uid);
      const lifetimeScorePromise = Auth.fetchLifetimeScore(viewUser.uid);
      Promise.all([scoresPromise, lifetimeScorePromise]).then(([myScores, lifetimeScore]) => {
        
        const totalScore = myScores.reduce((s,x) => s + (x.score||0), 0);
        const avgAcc     = myScores.length ? myScores.reduce((s,x) => s + (x.accuracy||0), 0) / myScores.length : 0;
        const maxCombo   = myScores.length ? Math.max(...myScores.map(x => x.maxCombo||0)) : 0;

        
        const totalPP = GamePP.calcTotalPP(myScores);
        
        const level    = GamePP.levelFromTotalScore(lifetimeScore);
        const progress = GamePP.progressFromTotalScore(lifetimeScore);

        
        const setStatEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        
        if (badgeEl) badgeEl.textContent = 'Lv.' + level;
        const ppEl        = document.getElementById('statPP');
        const lvEl        = document.getElementById('statLevel');
        const lvBarFillEl = document.getElementById('statLevelBarFill');
        const lvNextEl    = document.getElementById('statLevelNext');
        if (ppEl)         ppEl.textContent        = totalPP.toLocaleString() + 'pp';
        if (lvEl)         lvEl.textContent        = 'Lv.' + level;
        if (lvBarFillEl)  lvBarFillEl.style.width = progress.toFixed(1) + '%';
        if (lvNextEl)     lvNextEl.textContent    = 'Lv.' + (level + 1);
        setStatEl('statTotalScore', totalScore.toLocaleString());
        setStatEl('statBestAcc', myScores.length ? avgAcc.toFixed(2) + '%' : '—');
        setStatEl('statPlays', myScores.length);
        setStatEl('statMaxCombo', myScores.length ? maxCombo + 'x' : '—');

        
        const worldRankEl = document.getElementById('profileWorldRank');
        if (worldRankEl) {
          fetch(`/api/ranking?uid=${encodeURIComponent(viewUser.uid)}`)
            .then(r => r.json())
            .then(data => {
              if (data && data.rank) {
                worldRankEl.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> #${data.rank}`;
              }
            }).catch(() => {});
        }

        if (!listEl) return;
        if (!myScores.length) {
          listEl.innerHTML = `<div style="color:var(--text-dim);font-size:13px;padding:12px;">${isSelf ? 'ยังไม่มีคะแนน — ลองเล่นเพลงดูก่อน!' : 'ผู้เล่นคนนี้ยังไม่มีคะแนน'}</div>`;
          return;
        }
        myScores.forEach(s => { s._pp = GamePP.calcScorePP(s); });
        myScores.sort((a,b) => b._pp - a._pp);
        listEl.innerHTML = '';
        myScores.forEach((s, i) => {
          const item = document.createElement('div');
          item.className = 'profile-score-item' + (i === 0 ? ' top' : '');
          const scorePP = s._pp;
          const weight = Math.round(Math.pow(0.95, i) * 100);
          item.innerHTML = `
            <div class="psi-rank" style="color:${rankColor(s.rank)};background:${rankColor(s.rank)}22;">${esc(s.rank)}</div>
            <div class="psi-main">
              <div class="psi-title" title="${esc(s.songId)}">${esc(s.songId)}</div>
              <div class="psi-sub">Acc ${s.accuracy?.toFixed(2)}%  ·  Combo ${s.maxCombo}x  ·  Miss ${s.judgeCounts?.MISS??'—'}${s.ts ? '  ·  ' + timeAgoTH(s.ts) : ''}</div>
            </div>
            <div class="psi-side">
              <div class="psi-pp-row">
                <span class="psi-pp">${scorePP}pp</span>
                <span class="psi-weight">น้ำหนัก ${weight}%</span>
              </div>
              <span class="psi-score">${String(s.score).padStart(6,'0')}</span>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--text-dim);"><polyline points="9 18 15 12 9 6"/></svg>
          `;

          item.addEventListener('click', () => {
            openScoreDetail({
              songId: s.songId,
              beatmapSetId: s.beatmapSetId || null,
              score: s.score,
              accuracy: s.accuracy,
              rank: s.rank,
              maxCombo: s.maxCombo,
              judgeCounts: s.judgeCounts,
              ts: s.ts,
              uid: viewUser.uid,
              displayName: viewUser.displayName,
              photoURL: viewUser.photoURL,
              showPlay: true,
              showProfile: false,
            });
          });
          listEl.appendChild(item);
        });
      });
    }

    // ── World Ranking modal (ปุ่มแยกที่ header แทนแท็บในโปรไฟล์) ──
    const rankingModal    = document.getElementById('rankingModal');
    const rankingBackdrop = document.getElementById('rankingModalBackdrop');
    const btnWorldRanking = document.getElementById('btnWorldRanking');
    const btnCloseRanking = document.getElementById('btnCloseRanking');

    function openRankingModal() {
      if (!rankingModal) return;
      rankingModal.style.display = 'flex';
      if (rankingBackdrop) rankingBackdrop.style.display = 'block';
      loadGlobalRanking();
    }
    function closeRankingModal() {
      if (rankingModal) rankingModal.style.display = 'none';
      if (rankingBackdrop) rankingBackdrop.style.display = 'none';
    }
    if (btnWorldRanking) btnWorldRanking.addEventListener('click', openRankingModal);
    if (btnCloseRanking) btnCloseRanking.addEventListener('click', closeRankingModal);
    if (rankingBackdrop) rankingBackdrop.addEventListener('click', closeRankingModal);
    window._closeRankingModal = closeRankingModal;
    window._isRankingModalOpen = () => !!rankingModal && rankingModal.style.display === 'flex';

    function loadGlobalRanking() {
      const rkList = document.getElementById('worldRankingList');
      if (!rkList) return;
      const meUid = window.Auth && Auth.user ? Auth.user.uid : null;
      rkList.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:16px;">กำลังโหลด...</div>';
      fetch('/api/ranking?limit=50')
        .then(r => r.json())
        .then(ranking => {
          if (!ranking || !ranking.length) {
            rkList.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:16px;">ยังไม่มีข้อมูลอันดับ</div>';
            return;
          }
          rkList.innerHTML = '';

          // Highlight my rank at top if I'm not in top visible
          if (meUid) {
            const me = ranking.find(r => r.uid === meUid);
            if (me && me.rank > 10) {
              const myRow = buildRankRow(me, meUid, true);
              myRow.style.borderColor = 'rgba(255,93,143,0.4)';
              const pill = document.createElement('div');
              pill.style.cssText = 'font-size:11px;color:var(--text-dim);padding:8px 14px 4px;';
              pill.textContent = 'อันดับของคุณ';
              rkList.appendChild(pill);
              rkList.appendChild(myRow);
              const divider = document.createElement('div');
              divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.06);margin:8px 0;';
              rkList.appendChild(divider);
            }
          }

          ranking.forEach(r => {
            const row = buildRankRow(r, meUid);
            rkList.appendChild(row);
            // resolve server avatar หลัง append
            if (window.Auth?.resolveAvatar && r.uid) {
              const img = row.querySelector('img.rank-av-img');
              if (img) Auth.resolveAvatar(r.uid, r.photoURL || '', img);
              const span = row.querySelector('span.rank-av-fallback');
              if (span) Auth.resolveAvatar(r.uid, '', null).then(url => {
                if (url && span.isConnected) {
                  const ni = document.createElement('img');
                  ni.src = url; ni.referrerPolicy = 'no-referrer'; ni.className = 'rank-av-img';
                  span.replaceWith(ni);
                }
              });
            }
          });
        })
        .catch(() => {
          rkList.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:16px;">โหลดข้อมูลไม่สำเร็จ</div>';
        });
    }

    function buildRankRow(r, meUid, forceMeStyle) {
      const isMe = r.uid === meUid;
      const isTop3 = r.rank <= 3;
      const row = document.createElement('div');
      row.className = 'posu-rank-item' + (isMe || forceMeStyle ? ' is-me' : '') + (isTop3 ? ' top3' : '');

      // Rank number — no emoji, just styled number with rank class
      const rankClass = r.rank <= 3 ? ` rank-${r.rank}` : '';
      const numStr = `<span class="${rankClass}">#${r.rank}</span>`;

      const avatarInner = r.photoURL
        ? `<img src="${esc(r.photoURL)}" referrerpolicy="no-referrer" data-uid="${esc(r.uid||'')}" class="rank-av-img">`
        : `<span class="rank-av-fallback" data-uid="${esc(r.uid||'')}">${esc((r.displayName || '?')[0].toUpperCase())}</span>`;

      row.innerHTML = `
        <div class="posu-rank-num">${numStr}</div>
        <div class="posu-rank-avatar">${avatarInner}</div>
        <div class="posu-rank-info">
          <div class="posu-rank-name">${esc(r.displayName || '?')}${isMe ? ' <span style="font-size:10px;color:var(--accent-magenta);font-weight:600;">(คุณ)</span>' : ''}</div>
          <div class="posu-rank-sub">Lv.${r.level ?? 1}</div>
        </div>
        <div class="posu-rank-acc">${r.avgAcc?.toFixed(2) ?? '—'}%</div>
        <div class="posu-rank-plays">${(r.plays ?? 0).toLocaleString()}</div>
        <div class="posu-rank-pp">${(r.totalPP || 0).toLocaleString()}<span>pp</span></div>
      `;
      row.addEventListener('click', () => {
        closeRankingModal();
        if (window._openFriendProfile) _openFriendProfile(r.uid, r.displayName, r.photoURL);
      });
      return row;
    }

    
    window._openFriendProfile = function(uid, displayName, photoURL) {
      openProfile({ uid, displayName, photoURL });
    };

    
    const btnCloseProfile = document.getElementById('btnCloseProfile');
    if (btnCloseProfile) {
      btnCloseProfile.addEventListener('click', () => {
        const profileScreen = document.getElementById('screen-profile');
        if (profileScreen) { profileScreen.style.display = 'none'; profileScreen.classList.remove('active'); }
        
        if (window._closeProfileModal) window._closeProfileModal();
        else {
          
          const upload = document.getElementById('screen-upload');
          if (upload) upload.classList.add('active');
          const header = document.getElementById('mainHeader');
          if (header) header.style.display = '';
          const btnBack = document.getElementById('btnBackHome');
          if (btnBack) btnBack.style.display = 'none';
        }
      });
    }

    
    const lbPanel  = document.getElementById('leaderboardPanel');
    const lbList   = document.getElementById('leaderboardList');
    const lbSong   = document.getElementById('leaderboardSongName');
    const btnCloseLb = document.getElementById('btnCloseLeaderboard');
    if (btnCloseLb) btnCloseLb.addEventListener('click', () => { if (lbPanel) lbPanel.style.display='none'; });

    window._openLeaderboard = function(songId) {
      if (!lbPanel) return;
      if (lbSong) lbSong.textContent = songId;
      if (lbList) lbList.innerHTML = '<div style="color:var(--text-dim);font-size:13px;">กำลังโหลด...</div>';
      lbPanel.style.display = 'block';
      Auth.fetchLeaderboard(songId).then(board => {
        if (!lbList) return;
        if (!board.length) { lbList.innerHTML = '<div style="color:var(--text-dim);font-size:13px;">ยังไม่มีคะแนน เป็นคนแรก!</div>'; return; }
        lbList.innerHTML = board.map((s,i) => `
          <div class="lb-row" data-uid="${esc(s.uid||'')}" data-name="${esc(s.displayName||'')}" data-photo="${esc(s.photoURL||'')}" style="display:flex;align-items:center;gap:7px;padding:6px 8px;background:rgba(255,255,255,${i===0?'0.09':'0.03'});border-radius:5px;margin-bottom:3px;cursor:pointer;">
            <span style="font-size:11px;color:var(--text-dim);width:18px;text-align:center;flex-shrink:0;">#${i+1}</span>
            ${s.photoURL ? `<img src="${esc(s.photoURL)}" data-uid="${esc(s.uid||'')}" class="lb-av-img" style="width:22px;height:22px;border-radius:50%;flex-shrink:0;" referrerpolicy="no-referrer">` : `<span data-uid="${esc(s.uid||'')}" class="lb-av-fall" style="width:22px;height:22px;border-radius:50%;background:var(--accent);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${esc((s.displayName||'?')[0].toUpperCase())}</span>`}
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.displayName||'ไม่ระบุ')}</div>
              <div style="font-size:10px;color:var(--text-dim);">${s.accuracy?.toFixed(2)}%</div>
            </div>
            <span style="font-family:var(--font-display);font-size:12px;color:${rankColor(s.rank)};flex-shrink:0;">${esc(s.rank)}</span>
            <span style="font-family:var(--font-display);font-size:11px;flex-shrink:0;">${String(s.score).padStart(6,'0')}</span>
          </div>`).join('');
        // Attach score data objects to DOM elements for click handler
        lbList.querySelectorAll('.lb-row').forEach((row, i) => {
          const s = board[i];
          if (s) row._scoreData = {
            songId: document.getElementById('leaderboardSongName')?.textContent || '',
            score: s.score, accuracy: s.accuracy, rank: s.rank,
            maxCombo: s.maxCombo, judgeCounts: s.judgeCounts, ts: s.ts,
            uid: s.uid, displayName: s.displayName, photoURL: s.photoURL
          };
        });
        lbList.querySelectorAll('.lb-row').forEach(row => {
          row.addEventListener('click', () => {
            const sd = row._scoreData;
            if (sd) openScoreDetail({...sd, showPlay: false, showProfile: true});
          });
          row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const uid = row.dataset.uid;
            if (uid && window._openFriendProfile) window._openFriendProfile(uid, row.dataset.name, row.dataset.photo);
          });
        });
        
        if (window.Auth?.resolveAvatar) {
          board.forEach(s => {
            if (!s.uid) return;
            const img  = lbList.querySelector(`img.lb-av-img[data-uid="${CSS.escape(s.uid)}"]`);
            if (img) Auth.resolveAvatar(s.uid, s.photoURL || '', img);
            const span = lbList.querySelector(`span.lb-av-fall[data-uid="${CSS.escape(s.uid)}"]`);
            if (span) Auth.resolveAvatar(s.uid, '', null).then(url => {
              if (url && span.isConnected) {
                const ni = document.createElement('img');
                ni.src = url; ni.referrerPolicy = 'no-referrer';
                ni.style.cssText = 'width:22px;height:22px;border-radius:50%;flex-shrink:0;';
                span.replaceWith(ni);
              }
            });
          });
        }
      });
    };

    
    const resultScreen = document.getElementById('screen-result');
    if (resultScreen) {
      new MutationObserver(() => {
        if (resultScreen.classList.contains('active')) {
          const songId = document.getElementById('resultSong')?.textContent.trim();
          if (songId && window.Auth && Auth.user && !window._lastResultIsUpload) setTimeout(() => window._openLeaderboard(songId), 500);
        } else {
          if (lbPanel) lbPanel.style.display = 'none';
        }
      }).observe(resultScreen, { attributes: true, attributeFilter: ['class'] });
    }

    
    const searchModal   = document.getElementById('searchModal');
    const searchBackdrop = document.getElementById('searchModalBackdrop');
    const searchInput   = document.getElementById('globalSearchInput');
    const searchResults = document.getElementById('globalSearchResults');
    const btnFindFriends = document.getElementById('btnFindFriends');
    const btnCloseSearch = document.getElementById('btnCloseSearch');
    const tabPlayers = document.getElementById('tabPlayers');
    const tabSongs   = document.getElementById('tabSongs');
    let currentSearchTab = 'players';

    function openSearchModal() {
      if (!searchModal) return;
      searchModal.style.display = 'flex';
      if (searchBackdrop) searchBackdrop.style.display = 'block';
      if (searchInput) { searchInput.value = ''; searchInput.focus(); }
      runGlobalSearch('');
    }
    function closeSearchModal() {
      if (searchModal) searchModal.style.display = 'none';
      if (searchBackdrop) searchBackdrop.style.display = 'none';
    }
    function setSearchTab(tab) {
      currentSearchTab = tab;
      if (tabPlayers) tabPlayers.classList.toggle('active', tab === 'players');
      if (tabSongs) tabSongs.classList.toggle('active', tab === 'songs');
      if (searchInput) searchInput.placeholder = tab === 'players' ? 'พิมพ์ชื่อผู้เล่น...' : 'พิมพ์ชื่อเพลงหรือศิลปิน...';
      runGlobalSearch(searchInput ? searchInput.value : '');
    }

    function renderPlayerResults(players) {
      if (!searchResults) return;
      if (!players.length) {
        searchResults.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:8px 4px;">ไม่พบผู้เล่น</div>';
        return;
      }
      searchResults.innerHTML = players.map(p => `
        <div class="search-result-row" data-uid="${esc(p.uid)}" data-name="${esc(p.displayName)}" data-photo="${esc(p.photoURL||'')}" style="display:flex;align-items:center;gap:10px;padding:9px;background:rgba(255,255,255,0.03);border-radius:9px;cursor:pointer;">
          ${p.photoURL ? `<img src="${esc(p.photoURL)}" data-uid="${esc(p.uid||'')}" class="sr-av-img" style="width:32px;height:32px;border-radius:50%;flex-shrink:0;object-fit:cover;" referrerpolicy="no-referrer">` : `<span data-uid="${esc(p.uid||'')}" class="sr-av-fall" style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;">${esc((p.displayName||'?')[0].toUpperCase())}</span>`}
          <span style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.displayName)}</span>
        </div>`).join('');
      searchResults.querySelectorAll('.search-result-row').forEach(row => {
        row.addEventListener('click', () => {
          closeSearchModal();
          if (window._openFriendProfile) window._openFriendProfile(row.dataset.uid, row.dataset.name, row.dataset.photo);
        });
      });
      
      if (window.Auth?.resolveAvatar) {
        players.forEach(p => {
          if (!p.uid) return;
          const img  = searchResults.querySelector(`img.sr-av-img[data-uid="${CSS.escape(p.uid)}"]`);
          if (img) Auth.resolveAvatar(p.uid, p.photoURL || '', img);
          const span = searchResults.querySelector(`span.sr-av-fall[data-uid="${CSS.escape(p.uid)}"]`);
          if (span) Auth.resolveAvatar(p.uid, '', null).then(url => {
            if (url && span.isConnected) {
              const ni = document.createElement('img');
              ni.src = url; ni.referrerPolicy = 'no-referrer';
              ni.style.cssText = 'width:32px;height:32px;border-radius:50%;flex-shrink:0;object-fit:cover;';
              span.replaceWith(ni);
            }
          });
        });
      }
    }

    function renderSongResults(localEntries, mirrorEntries) {
      if (!searchResults) return;
      const local = localEntries || [];
      const mirror = mirrorEntries || [];
      if (!local.length && !mirror.length) {
        searchResults.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:8px 4px;">ไม่พบเพลง</div>';
        return;
      }
      const sectionLabel = (text) => `<div style="font-size:11px;color:var(--text-dim);padding:6px 4px 3px;letter-spacing:0.04em;text-transform:uppercase;">${text}</div>`;
      const cardHtml = (e, isMirror) => `
        <div class="search-result-row" data-entry-id="${esc(e.id)}" style="display:flex;align-items:center;gap:10px;padding:9px;background:rgba(255,255,255,0.03);border-radius:9px;cursor:pointer;">
          <span style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,0.06);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:${isMirror ? '#f5a623' : 'var(--accent-teal)'};">
            ${isMirror
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
              : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`}
          </span>
          <div style="min-width:0;flex:1;">
            <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e._preview ? e._preview.title : e.name)}</div>
            ${(e._preview && e._preview.artist) ? `<div style="font-size:11px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e._preview.artist)}</div>` : ''}
          </div>
        </div>`;

      let html = '';
      if (local.length) {
        html += sectionLabel('ในเครื่อง');
        html += local.map(e => cardHtml(e, false)).join('');
      }
      if (mirror.length) {
        html += sectionLabel('osu! Mirror');
        html += mirror.map(e => cardHtml(e, true)).join('');
      }
      searchResults.innerHTML = html;
      searchResults.querySelectorAll('.search-result-row').forEach(row => {
        row.addEventListener('click', () => {
          closeSearchModal();
          if (window._openSongById) window._openSongById(row.dataset.entryId);
        });
      });
    }

    let _songMirrorTimer = null;
    let _songMirrorSeq = 0;

    function runGlobalSearch(q) {
      if (!searchResults) return;
      const query = (q || '').trim().toLowerCase();
      if (currentSearchTab === 'players') {
        searchResults.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:8px 4px;">กำลังค้นหา...</div>';
        Auth.searchPlayers(query).then(renderPlayerResults);
      } else {
        
        const all = (window._getLibraryEntries && window._getLibraryEntries()) || [];
        const matched = !query ? all : all.filter(e => {
          const text = e._preview ? (e._preview.title + ' ' + e._preview.artist) : e.name;
          return text.toLowerCase().includes(query);
        });
        renderSongResults(matched, []);

        
        _songMirrorSeq++;
        clearTimeout(_songMirrorTimer);
        if (query) {
          const seq = _songMirrorSeq;
          _songMirrorTimer = setTimeout(async () => {
            try {
              async function fetchSets(q2) {
                const res = await fetch(`/api/beatmap/search?q=${encodeURIComponent(q2)}&mode=3&page=0`);
                if (!res.ok) return [];
                const data = await res.json();
                return Array.isArray(data) ? data : (data.beatmapsets || data.results || []);
              }

              
              function normStr(s) {
                return (s || '').toLowerCase()
                  .replace(/\s*[\(\[]f(?:eat|t)\.?[^\)\]]*[\)\]]/gi, '')
                  .replace(/\s+/g, ' ').trim();
              }

              // filterRelevant เหมือนหน้าแรก — ตรวจ title/title_unicode แบบ cross-match
              function filterRelevant(sets, q) {
                const lq = q.toLowerCase();
                const nq = normStr(q);
                return sets.filter(s => {
                  const t  = (s.title || '').toLowerCase();
                  const tu = (s.title_unicode || '').toLowerCase();
                  const nt  = normStr(s.title);
                  const ntu = normStr(s.title_unicode);
                  return t.includes(lq)  || tu.includes(lq)  ||
                         lq.includes(t)  || lq.includes(tu)  ||
                         nt.includes(nq) || ntu.includes(nq) ||
                         nq.includes(nt) || nq.includes(ntu);
                });
              }

              // queryVariants เหมือนหน้าแรก: เต็ม, ตัดถึง feat., ตัด feat. ทิ้ง
              const queryVariants = [query];
              const beforeFeatDot = query.replace(/\s+f(?:eat|t)\.?\s+.+$/gi, ' feat.').trim();
              if (beforeFeatDot !== query) queryVariants.push(beforeFeatDot);
              const noFeat = query
                .replace(/\s*[\(\[]f(?:eat|t)\.?[^\)\]]*[\)\]]/gi, '')
                .replace(/\s+f(?:eat|t)\.?.*$/gi, '')
                .trim();
              if (noFeat && noFeat !== query && noFeat !== beforeFeatDot) queryVariants.push(noFeat);

              const results = await Promise.all(queryVariants.map(v => fetchSets(v)));
              if (seq !== _songMirrorSeq) return;

              // รวม deduplicate
              const seen = new Set(); const allSets = [];
              for (const r of results) for (const s of r) { if (!seen.has(s.id)) { seen.add(s.id); allSets.push(s); } }

              // กรองที่ชื่อตรงก่อน ถ้าว่างค่อยใช้ผลดิบ
              let filtered = filterRelevant(allSets, query);
              if (!filtered.length) filtered = allSets;
              if (!filtered.length) return;

              // แปลง mirror sets เป็น entry-like objects สำหรับ renderSongResults
              const mirrorEntries = filtered.map(s => ({
                id: 'mirror-search:' + s.id,
                name: (s.title_unicode || s.title || '?'),
                _preview: {
                  title: s.title_unicode || s.title || '?',
                  artist: s.artist_unicode || s.artist || '',
                },
                _mirrorSetId: s.id,
                source: 'mirror',
              }));

              
              const localIds = new Set(matched.map(e => e.id));
              const mirrorOnly = mirrorEntries.filter(e => !localIds.has(e.id));
              if (seq !== _songMirrorSeq) return;
              renderSongResults(matched, mirrorOnly);
            } catch(e) {  }
          }, 400);
        }
      }
    }

    if (btnFindFriends) btnFindFriends.addEventListener('click', openSearchModal);
    if (btnCloseSearch) btnCloseSearch.addEventListener('click', closeSearchModal);
    if (searchBackdrop) searchBackdrop.addEventListener('click', closeSearchModal);
    if (tabPlayers) tabPlayers.addEventListener('click', () => setSearchTab('players'));
    if (tabSongs) tabSongs.addEventListener('click', () => setSearchTab('songs'));
    if (searchInput) {
      let debTimer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(debTimer);
        debTimer = setTimeout(() => runGlobalSearch(searchInput.value), 250);
      });
    }

    const style = document.createElement('style');
    style.textContent = `
      #leaderboardPanel { transition: opacity .2s; }
      @media (max-width:700px) {
        #leaderboardPanel { width:100%!important; border-left:none!important; border-top:1px solid rgba(255,255,255,0.08); top:auto!important; bottom:0; height:55%; }
        #searchModal { width:94vw!important; height:80vh!important; }
        #rankingModal { width:94vw!important; height:80vh!important; }
      }
    `;
    document.head.appendChild(style);
  });
})();