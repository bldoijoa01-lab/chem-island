// HUD(가방·메뉴·시계·속도·팀 버튼)와 팀 창(13-d): fp/와 td/가 같은 DOM(#inv3 #menu3 #top3 #spd3 ...)을 같은 코드로 채운다. fp/main.js에 있던 것을 그대로 옮겼다.
import { Party } from './party.js';
const Art = window.Art, S = Store.S, { ITEM, TOOL } = World;
const { $, fmt, say, refresh, openBuild, openCraft, openLog, openSave, api, capText, pAtm } = UI;
export function initHud(pl) {
const inv3 = $('inv3'), menu3 = $('menu3'), spd = $('spd3');
[['hammer', '건설', () => openBuild()], ['gear', '제작', () => openCraft()], ['book', '연구 노트', () => window.Notes && Notes.open(api)], ['scroll', '기록', () => openLog()], ['disk', '저장/계정', () => openSave()]].forEach(([icon, label, fn]) => {
  const b = document.createElement('button'); b.title = label; b.innerHTML = `<i style="background-image:url(${Art.iconURL[icon]})"></i>`; b.onclick = fn; menu3.appendChild(b);
});
{ const b = document.createElement('button'); b.id = 'teambtn'; b.title = '팀'; b.textContent = '팀'; b.onclick = () => TeamUI.open(); menu3.appendChild(b); }
[10, 3, 1].forEach(sp => { const b = document.createElement('button'); b.textContent = 'x' + sp; b.dataset.sp = sp; b.title = `시간 속도 x${sp}`; b.onclick = () => { S.speed = sp; }; spd.appendChild(b); });
let invSig = '';
function drawHud() {
  const items = Object.entries(S.inv).filter(([, v]) => v >= 1).map(([k, v]) => ({ k, icon: ITEM[k][0], name: ITEM[k][1], n: Math.floor(v) }));
  if (S.caps.length) items.push({ icon: 'cap', name: '기체 캡슐 (' + capText() + ')', n: S.caps.length });
  if (S.packs.length) items.push({ icon: 'pack', name: '한제 팩', n: S.packs.length });
  const sig = JSON.stringify(items) + pl.sel + pl.mode;
  if (sig !== invSig) {
    invSig = sig; inv3.innerHTML = '';
    let hot = 0;
    for (const it of items) {
      const b = document.createElement('button'), usableItem = TOOL[it.k]; b.className = 'slot';
      b.title = `${it.name} ${it.n}` + (TOOL[it.k] ? ' (선택 후 우클릭: 사용)' : it.k === 'pickaxe' ? ' (돌을 팔 때 자동 사용)' : '');
      b.innerHTML = `<i style="background-image:url(${Art.iconURL[it.icon]})"></i><b>${it.n}</b>` + (usableItem ? `<u>${++hot}</u>` : '');
      if (usableItem) { b.classList.toggle('on', pl.sel === it.k); b.onclick = () => pl.selectItem(it.k); }
      inv3.appendChild(b);
    }
    const q = $('quest'); q.style.top = (inv3.offsetHeight + 16) + 'px'; q.style.left = '8px';
  }
  const hh = String(Math.floor(S.min / 60)).padStart(2, '0'), mm = String(Math.floor(S.min % 60)).padStart(2, '0');
  $('clock3').textContent = `D${S.day} ${hh}:${mm}`;
  $('clock3').title = `${S.day}일차 ${hh}:${mm} · ${Sim.ISLANDS[Sim.dockOf(S).island].name} 외기 ${Math.round(Sim.airTemp(S))}℃ · ${fmt(pAtm(), 2)} atm`;
  $('temp3').textContent = `${Math.round(Sim.airTemp(S))}℃ · ${fmt(pAtm(), 2)} atm`;
  const sp1 = Party.speed(); spd.querySelectorAll('button').forEach(b => { b.classList.toggle('on', +b.dataset.sp === sp1); b.disabled = Party.inParty() && Party.online() > 1; });
  { const tb = $('teambtn'); if (Party.inParty() && Party.meta) { tb.style.borderColor = Party.meta.color; tb.title = `팀 ${Party.meta.name}`; } else { tb.style.borderColor = ''; tb.title = '팀'; } }

}
  return { drawHud };
}

export const TeamUI = window.TeamUI = {
  open() { if (Party.inParty()) UI.openModal('팀', Party.panelHtml(), () => { if (UI.isModalOpen() && document.getElementById('mtitle').textContent === '팀') document.getElementById('mbody').innerHTML = Party.panelHtml(); }); else UI.openModal('팀', Party.noPartyHtml()); },
  err(e) { const el = document.getElementById('tm-err'); if (el) el.textContent = e.message || String(e); else say(e.message || String(e)); },
  async create() { try { await Party.create(document.getElementById('tm-name').value, document.getElementById('tm-color').value); say('팀을 만들었습니다. 초대 코드를 친구에게 알려 주세요.'); TeamUI.open(); } catch (e) { TeamUI.err(e); } },
  async join() { if (S.placed.length && !confirm('지금 가진 장치는 철거되어 재료로 돌려받고, 팀의 탐사정과 진행도를 이어받습니다. 들어갈까요?')) return; try { await Party.join(document.getElementById('tm-code').value); say('팀에 들어왔습니다.'); TeamUI.open(); } catch (e) { TeamUI.err(e); } },
  async leave() { if (!confirm('팀을 나갈까요? 팀의 장치는 두고 가고, 나는 새 탐사정으로 처음부터 시작합니다. 인벤토리는 가져갑니다.')) return; await Party.leave(); say('팀에서 나왔습니다.'); TeamUI.open(); },
  warehouse() { UI.openModal('공용 창고', Party.warehouseHtml(ITEM), () => { if (document.getElementById('mtitle').textContent === '공용 창고') document.getElementById('mbody').innerHTML = Party.warehouseHtml(ITEM); }); },
  async xfer(item, n) { await Party.transfer(item, n); },
};

// 장치 패널의 행동(공용 ui.js의 window.act)과 탐사정 넓히기는 팀 기록에 남긴다. 장치는 pl.doInteract에서 이미 팀 쓰기 권한을 얻은 뒤에 열린다
export function wrapActions() {
{ const act0 = window.act; window.act = (name, arg) => { act0(name, arg); Party.note('device', `장치 조작: ${name}`); };
  const exp0 = G.expandRaft; G.expandRaft = () => { if (Party.inParty()) Party.guard(() => { exp0(); Party.note('device', '탐사정 확장'); }); else exp0(); }; }
}
