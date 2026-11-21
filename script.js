document.addEventListener('DOMContentLoaded', function () {
  // --- 1. Live Glossary Search (Whole-Word Boundary) ---
  var glossarySearch = document.getElementById('glossarySearch');
  var glossaryNoResults = document.getElementById('glossaryNoResults');
  var glossaryMq = document.getElementById('glossaryMq');

  function filterGlossary() {
    if (!glossarySearch) return;
    var query = glossarySearch.value.trim();
    var cards = glossaryMq.querySelectorAll('.term-card');
    var cats = glossaryMq.querySelectorAll('.glossary-cat');
    var visibleCount = 0;

    if (!query) {
      cards.forEach(function (c) { c.classList.remove('hidden'); });
      cats.forEach(function (cat) { cat.classList.remove('hidden'); });
      if (glossaryNoResults) glossaryNoResults.classList.add('hidden');
      return;
    }

    var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('\\b' + escaped, 'i');

    cards.forEach(function (card) {
      var match = regex.test(card.textContent);
      card.classList.toggle('hidden', !match);
      if (match) visibleCount++;
    });

    cats.forEach(function (cat) {
      var next = cat.nextElementSibling;
      var hasVisible = false;
      while (next && !next.classList.contains('glossary-cat')) {
        if (next.classList.contains('term-card') && !next.classList.contains('hidden')) {
          hasVisible = true;
          break;
        }
        next = next.nextElementSibling;
      }
      cat.classList.toggle('hidden', !hasVisible);
    });

    if (glossaryNoResults) {
      glossaryNoResults.classList.toggle('hidden', visibleCount > 0);
    }
  }

  if (glossarySearch) {
    glossarySearch.addEventListener('input', filterGlossary);
  }

  // --- 2. Top Tab Switcher ---
  var tabMcast = document.getElementById('tabMcast');
  var tabQos = document.getElementById('tabQos');
  var tabLag = document.getElementById('tabLag');
  var panelMcast = document.getElementById('panelMcast');
  var panelQos = document.getElementById('panelQos');
  var panelLag = document.getElementById('panelLag');

  function activateTab(activeBtn, activePanel) {
    [tabMcast, tabQos, tabLag].forEach(function (t) { t.classList.remove('active'); });
    [panelMcast, panelQos, panelLag].forEach(function (p) { p.classList.add('hidden'); });
    activeBtn.classList.add('active');
    activePanel.classList.remove('hidden');
  }

  tabMcast.addEventListener('click', function () { activateTab(tabMcast, panelMcast); });
  tabQos.addEventListener('click', function () { activateTab(tabQos, panelQos); });
  tabLag.addEventListener('click', function () { activateTab(tabLag, panelLag); });

  // --- 3. IPv4 Multicast (PIM-SM & RPF) Simulator ---
  var mcastScenarios = {
    'igmp-join': {
      tree: 'Receiver → LHR (Last-Hop Router)',
      mac: '239.1.1.10 → 0100.5e01.010a',
      rpf: 'N/A (Local Host Join)',
      explain: 'Host sends an IGMPv2/v3 Membership Report to 239.1.1.10. Because 239.1.1.10 and 224.129.1.10 share the exact same lower 23 bits, both map to MAC 0100.5e01.010a (32-to-1 IPv4-to-MAC overlap). IGMP Snooping on L2 switches prevents multicast flooding to non-interested ports.',
      cli: '! Enable PIM Sparse Mode on LHR SVI & verify IGMP group\ninterface Vlan10\n ip address 10.10.10.1 255.255.255.0\n ip pim sparse-mode\n!\nshow ip igmp groups 239.1.1.10\nshow ip igmp snooping groups vlan 10'
    },
    'pim-shared': {
      tree: '(*, 239.1.1.10) Shared Tree',
      mac: 'RP: 10.255.255.1 (Loopback0)',
      rpf: 'RPF Check toward RP IP',
      explain: 'Upon receiving the IGMP join, the Last-Hop Router (LHR) builds a (*, 239.1.1.10) entry and sends a PIM (*,G) Join toward the Rendezvous Point (RP). Meanwhile, the First-Hop Router (FHR) encapsulates initial source packets into unicast PIM Register messages to the RP.',
      cli: '! Configure static RP (or discover dynamically via BSR / Auto-RP)\nip multicast-routing\nip pim rp-address 10.255.255.1\n!\nshow ip mroute 239.1.1.10\n! (*, 239.1.1.10), RP 10.255.255.1, flags: SJC'
    },
    'pim-spt': {
      tree: '(10.10.50.5, 239.1.1.10) SPT',
      mac: 'Direct Source-to-Receiver Path',
      rpf: 'RPF Check toward Source 10.10.50.5',
      explain: 'Once the LHR receives the first multicast packet down the shared tree, it learns the source IP (10.10.50.5). By default on Cisco IOS-XE (ip pim spt-threshold 0), the LHR immediately sends a PIM (S,G) Join directly toward the source and prunes the suboptimal RP path.',
      cli: '! Verify (S,G) Shortest-Path Tree state after SPT switchover\nshow ip mroute 239.1.1.10\n! (10.10.50.5, 239.1.1.10), flags: JT\n!   Incoming interface: GigabitEthernet0/1, RPF nbr 10.1.12.1\n!   Outgoing interface list: Vlan10, Forward/Sparse'
    },
    'rpf-fail': {
      tree: 'Packet Dropped (RPF Failure)',
      mac: 'Incoming Intf != Unicast Route Intf',
      rpf: 'FAILED (Loop Prevention)',
      explain: 'Multicast routers check the Source IP against the unicast routing table. If a multicast packet arrives on GigabitEthernet0/2, but the unicast route back to Source 10.10.50.5 exits GigabitEthernet0/1, the RPF check FAILS and the router silently drops the packet to prevent multicast loops.',
      cli: '! Troubleshoot RPF failures on Cisco IOS-XE\nshow ip rpf 10.10.50.5\nshow ip mroute 239.1.1.10 count\n! Fix: Align unicast IGP metric or add a static mroute:\nip mroute 10.10.50.0 255.255.255.0 GigabitEthernet0/2'
    }
  };

  var mcastSelect = document.getElementById('mcastSelect');
  function renderMcast() {
    var item = mcastScenarios[mcastSelect.value];
    document.getElementById('mcastMetrics').innerHTML =
      '<div class="metric-pill"><span>Multicast Tree State</span><strong>' + item.tree + '</strong></div>' +
      '<div class="metric-pill"><span>L2 MAC / RP Mapping</span><strong>' + item.mac + '</strong></div>' +
      '<div class="metric-pill"><span>RPF Verification</span><strong>' + item.rpf + '</strong></div>';
    document.getElementById('mcastExplain').textContent = item.explain;
    document.getElementById('mcastCli').textContent = item.cli;
  }
  mcastSelect.addEventListener('change', renderMcast);
  // --- 4. QoS DSCP / CoS Calculator & MQC CLI ---
  var qosClasses = {
    'ef': {
      dscpDec: 'DSCP 46 (Binary: 101110)',
      tosHex: 'ToS 184 (0xB8) | L2 CoS 5',
      action: 'LLQ Strict Priority Queue',
      explain: 'Expedited Forwarding (EF — DSCP 46) is reserved for delay-sensitive VoIP audio. In Cisco MQC, assign EF traffic to a strict priority queue (LLQ) with a built-in policer so voice never waits behind data bursts and never starves control traffic.',
      cli: 'class-map match-any VOICE-EF\n match dscp ef\n!\npolicy-map WAN-QOS-OUT\n class VOICE-EF\n  priority percent 20\n class class-default\n  fair-queue'
    },
    'af41': {
      dscpDec: 'DSCP 34 (Binary: 100010)',
      tosHex: 'ToS 136 (0x88) | L2 CoS 4',
      action: 'CBWFQ Guaranteed Bandwidth',
      explain: 'Assured Forwarding 41 (AF41 — DSCP 34: Class 4, Low Drop Precedence 1) is used for interactive video conferencing. Uses CBWFQ minimum bandwidth guarantees rather than strict LLQ priority.',
      cli: 'class-map match-any VIDEO-AF41\n match dscp af41\n!\npolicy-map WAN-QOS-OUT\n class VIDEO-AF41\n  bandwidth percent 30'
    },
    'cs3': {
      dscpDec: 'DSCP 24 (Binary: 011000)',
      tosHex: 'ToS 96 (0x60) | L2 CoS 3',
      action: 'CBWFQ Signaling Queue',
      explain: 'Class Selector 3 (CS3 — DSCP 24) carries VoIP/video call signaling (SIP/SCCP). Backward-compatible with legacy IP Precedence 3 (first 3 bits = 011).',
      cli: 'class-map match-any SIGNALING-CS3\n match dscp cs3\n!\npolicy-map WAN-QOS-OUT\n class SIGNALING-CS3\n  bandwidth percent 5'
    },
    'af21': {
      dscpDec: 'DSCP 18 (Binary: 010010)',
      tosHex: 'ToS 72 (0x48) | L2 CoS 2',
      action: 'CBWFQ + WRED / Shaping',
      explain: 'Assured Forwarding 21 (AF21 — DSCP 18) is used for transactional enterprise applications (ERP/CRM). Pairs well with WRED (Weighted Random Early Detection) to prevent TCP global synchronization.',
      cli: 'policy-map WAN-SHAPER\n class class-default\n  shape average 100000000\n  service-policy WAN-QOS-OUT'
    },
    'be': {
      dscpDec: 'DSCP 0 (Binary: 000000)',
      tosHex: 'ToS 0 (0x00) | L2 CoS 0',
      action: 'Policing (Drop/Re-mark Excess)',
      explain: 'Best Effort (BE / CS0 — DSCP 0) receives whatever bandwidth remains in class-default. Inbound untrusted guest/bulk traffic is often policed (dropped or re-marked) at the network edge.',
      cli: 'policy-map INBOUND-POLICER\n class class-default\n  police 50000000 conform-action transmit exceed-action drop'
    }
  };

  var qosSelect = document.getElementById('qosSelect');
  function renderQos() {
    var item = qosClasses[qosSelect.value];
    document.getElementById('qosMetrics').innerHTML =
      '<div class="metric-pill"><span>6-Bit DSCP Value</span><strong>' + item.dscpDec + '</strong></div>' +
      '<div class="metric-pill"><span>8-Bit IP ToS &amp; L2 CoS</span><strong>' + item.tosHex + '</strong></div>' +
      '<div class="metric-pill"><span>MQC Queue / Action</span><strong>' + item.action + '</strong></div>';
    document.getElementById('qosExplain').textContent = item.explain;
    document.getElementById('qosCli').textContent = item.cli;
  }
  qosSelect.addEventListener('change', renderQos);

  // --- 5. EtherChannel (LACP / PAgP) Negotiation Simulator ---
  var lagSideA = document.getElementById('lagSideA');
  var lagSideB = document.getElementById('lagSideB');

  function evaluateLag() {
    var a = lagSideA.value;
    var b = lagSideB.value;
    var verdictEl = document.getElementById('lagVerdict');
    var explainEl = document.getElementById('lagExplain');

    var lacp = ['active', 'passive'];
    var pagp = ['desirable', 'auto'];
    var pass = false;
    var reason = '';

    if (a === 'on' && b === 'on') {
      pass = true;
      reason = 'Both switches are configured in static "on" mode (no LACP or PAgP frames sent). The Port-Channel forms unconditionally—ensure identical speed, duplex, trunking, and allowed VLANs on both ends.';
    } else if (a === 'on' || b === 'on') {
      pass = false;
      reason = 'MISMATCH: Static "on" mode never sends LACP or PAgP negotiation packets, so the peer waiting for LACP/PAgP will leave its member ports suspended/independent.';
    } else if (lacp.includes(a) && lacp.includes(b)) {
      if (a === 'active' || b === 'active') {
        pass = true;
        reason = 'LACP (IEEE 802.3ad / 802.1AX) negotiation SUCCEEDS because at least one switch is in "active" mode initiating LACPDU packets.';
      } else {
        pass = false;
        reason = 'LACP FAILS: Both sides are in "passive" mode—neither switch initiates LACPDU negotiation packets.';
      }
    } else if (pagp.includes(a) && pagp.includes(b)) {
      if (a === 'desirable' || b === 'desirable') {
        pass = true;
        reason = 'Cisco PAgP negotiation SUCCEEDS because at least one switch is in "desirable" mode initiating PAgP packets.';
      } else {
        pass = false;
        reason = 'PAgP FAILS: Both sides are in "auto" mode—neither switch initiates PAgP negotiation packets.';
      }
    } else {
      pass = false;
      reason = 'PROTOCOL MISMATCH: LACP (IEEE 802.3ad) and PAgP (Cisco proprietary) are incompatible and cannot negotiate with each other.';
    }

    verdictEl.textContent = pass
      ? 'PORT-CHANNEL UP (SU — Layer 2 Bundled)'
      : 'PORT-CHANNEL DOWN (No Bundle Formed)';
    verdictEl.className = 'verdict-banner ' + (pass ? 'verdict-pass' : 'verdict-fail');
    explainEl.textContent = reason;
  }

  lagSideA.addEventListener('change', evaluateLag);
  lagSideB.addEventListener('change', evaluateLag);

  // Close parent modal on Esc key when embedded in 4any1
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && window.parent !== window) {
      window.parent.postMessage('closeMulticastQosModal', '*');
    }
  });

  renderMcast();
  renderQos();
  evaluateLag();
});
