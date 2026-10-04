export type Language = 'en' | 'hi';

export interface Translations {
  appName: string;
  commandCenter: string;
  meshActive: string;
  drillBannerText: string;
  drillBannerSub: string;
  offlineBannerText: string;
  navMap: string;
  navTeams: string;
  navMetrics: string;
  navAdmin: string;
  navShortcuts: string;
  loginTitle: string;
  loginSubtitle: string;
  emailLabel: string;
  passwordLabel: string;
  totpLabel: string;
  totpHelp: string;
  loginButton: string;
  logoutButton: string;
  quickFill: string;
  sessionExpiring: string;
  sessionTimeoutWarning: string;
  stayLoggedIn: string;
  priorityCritical: string;
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;
  stateNew: string;
  stateAssigned: string;
  stateEnRoute: string;
  stateReached: string;
  stateClosed: string;
  stateFalseAlarm: string;
  queueTitle: string;
  queueSubtitle: string;
  searchPlaceholder: string;
  filterAll: string;
  filterNeeds: string;
  filterFlags: string;
  filterState: string;
  filterRegion: string;
  peopleCount: string;
  score: string;
  lastSeen: string;
  assignedTo: string;
  noClustersFound: string;
  drawerTitle: string;
  tabOverview: string;
  tabScoreBreakdown: string;
  tabTrust: string;
  tabTimeline: string;
  tabPackets: string;
  tabChat: string;
  memberLocations: string;
  actionsHeader: string;
  btnAssignTeam: string;
  btnSendAck: string;
  btnChangeState: string;
  btnMarkFalseAlarm: string;
  btnMergeSplit: string;
  btnAddNote: string;
  btnRequestSecondTeam: string;
  ackTemplateHelp: string;
  ackTemplateStay: string;
  ackTemplateMove: string;
  ackTemplateInfo: string;
  etaLabel: string;
  minutes: string;
  confirmActionTitle: string;
  confirmActionBody: string;
  btnConfirm: string;
  btnCancel: string;
  undoText: string;
  btnUndo: string;
  falseAlarmReasonRequired: string;
  falseAlarmReasonPlaceholder: string;
  privacyRestricted: string;
  privacyNotice: string;
  layersTitle: string;
  layerTeams: string;
  layerHeatmap: string;
  layerBoundary: string;
  layerGateways: string;
  replayTimeSlider: string;
  teamsTitle: string;
  teamsSubtitle: string;
  metricsTitle: string;
  metricsSubtitle: string;
  btnExportCsv: string;
  btnExportPdf: string;
  adminTitle: string;
  tabUsers: string;
  tabAgencies: string;
  tabSms: string;
  tabWeights: string;
  tabRetention: string;
  tabAudit: string;
  highContrast: string;
  largeType: string;
  audioAlerts: string;
  soundMuted: string;
  soundUnmuted: string;
  langToggle: string;
  shortcutsTitle: string;
  shortcutsClose: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    appName: 'RescueNet Incident Command',
    commandCenter: 'Control Room Triage & Operations',
    meshActive: 'BLE MESH LIVE',
    drillBannerText: 'EXERCISE / DRILL IN PROGRESS - NOT AN ACTUAL DISASTER',
    drillBannerSub: 'Simulated survivor cluster telemetry and drill response mode.',
    offlineBannerText: 'NETWORK OFFLINE - Operating on cached field telemetry. Reconnecting...',
    navMap: 'Triage Map',
    navTeams: 'Field Teams',
    navMetrics: 'Ops Metrics',
    navAdmin: 'Administration',
    navShortcuts: 'Shortcuts (?)',
    loginTitle: 'RescueNet Control Room',
    loginSubtitle: 'Secure access for authorized disaster response personnel',
    emailLabel: 'Operational Email',
    passwordLabel: 'Password',
    totpLabel: '6-Digit TOTP Token',
    totpHelp: 'Enter current 2FA security code from your authenticator app',
    loginButton: 'Authenticate & Enter Command Room',
    logoutButton: 'Sign Out',
    quickFill: 'Quick Fill Role Demo:',
    sessionExpiring: 'Session Expiring Soon',
    sessionTimeoutWarning: 'Your secure session will expire in 2 minutes due to inactivity.',
    stayLoggedIn: 'Extend Session',
    priorityCritical: 'CRITICAL',
    priorityHigh: 'HIGH',
    priorityMedium: 'MEDIUM',
    priorityLow: 'LOW',
    stateNew: 'New SOS',
    stateAssigned: 'Assigned',
    stateEnRoute: 'En Route',
    stateReached: 'On Scene',
    stateClosed: 'Resolved',
    stateFalseAlarm: 'False Alarm',
    queueTitle: 'Priority Triage Queue',
    queueSubtitle: 'Ranked by composite survivor triage urgency score',
    searchPlaceholder: 'Search cluster ID, location, or floor...',
    filterAll: 'All States',
    filterNeeds: 'Needs Filter',
    filterFlags: 'Telemetry Flags',
    filterState: 'State',
    filterRegion: 'Sector',
    peopleCount: 'Survivors',
    score: 'Score',
    lastSeen: 'Freshness',
    assignedTo: 'Team',
    noClustersFound: 'No survivor clusters match the current filters.',
    drawerTitle: 'Survivor Cluster Intelligence',
    tabOverview: 'Summary',
    tabScoreBreakdown: 'Score Breakdown',
    tabTrust: 'Trust & Authenticity',
    tabTimeline: 'Timeline',
    tabPackets: 'Raw Packets',
    tabChat: 'Field Chat',
    memberLocations: 'Cluster Beacon Dispersion (Mini Map)',
    actionsHeader: 'Command Actions (Human in the Loop)',
    btnAssignTeam: 'Assign Rescue Team',
    btnSendAck: 'Dispatch Signed ACK',
    btnChangeState: 'Update State',
    btnMarkFalseAlarm: 'Flag False Alarm',
    btnMergeSplit: 'Merge / Split',
    btnAddNote: 'Add Tactical Note',
    btnRequestSecondTeam: 'Request 2nd Team (>10 Survivors)',
    ackTemplateHelp: 'Help is on the way. Rescuers dispatched.',
    ackTemplateStay: 'Stay where you are. Shelter in place.',
    ackTemplateMove: 'Move cautiously toward safe rally point.',
    ackTemplateInfo: 'Need more information. Reply with status.',
    etaLabel: 'Estimated Arrival (Minutes)',
    minutes: 'min',
    confirmActionTitle: 'Confirm Command Dispatch',
    confirmActionBody: 'Are you sure you want to execute this operation? An undo window will be available.',
    btnConfirm: 'Confirm & Dispatch',
    btnCancel: 'Cancel',
    undoText: 'Action dispatched successfully.',
    btnUndo: 'Undo (10s)',
    falseAlarmReasonRequired: 'A mandatory justification is required to flag false alarm.',
    falseAlarmReasonPlaceholder: 'Enter verification reason (e.g., duplicate beacon, field scout confirmation)...',
    privacyRestricted: '[RESTRICTED TO AUTHORIZED RESPONDERS]',
    privacyNotice: 'Precise coordinates are logged and restricted per NDRF Privacy Directive.',
    layersTitle: 'GIS Map Layers',
    layerTeams: 'Tactical Teams',
    layerHeatmap: 'Report Density Heatmap',
    layerBoundary: 'Incident Zone Boundary',
    layerGateways: 'Mesh & SMS Gateways',
    replayTimeSlider: 'Incident Time Travel Scrubber',
    teamsTitle: 'Tactical Response Teams Roster',
    teamsSubtitle: 'Field responder positions, workload status, and assignment tracking',
    metricsTitle: 'Operations & Mesh Performance Metrics',
    metricsSubtitle: 'Real-time telemetry analytics from /v1/stats',
    btnExportCsv: 'Export CSV Log',
    btnExportPdf: 'Print Situation Report (PDF)',
    adminTitle: 'Command Room Administration & Security',
    tabUsers: 'Users & Roles',
    tabAgencies: 'Agencies & CA Key Rotation',
    tabSms: 'SMS Gateway Pool',
    tabWeights: 'Tunable Triage Weights',
    tabRetention: 'Data Retention & Purge',
    tabAudit: 'Audit Log Viewer',
    highContrast: 'High Contrast Mode',
    largeType: 'Large Display Mode',
    audioAlerts: 'Critical Cluster Sound Alert',
    soundMuted: 'Muted',
    soundUnmuted: 'Sound On',
    langToggle: 'हिन्दी',
    shortcutsTitle: 'Control Room Keyboard Shortcuts',
    shortcutsClose: 'Close (Esc)',
  },
  hi: {
    appName: 'रेस्क्यूनेट आपदा नियंत्रण कक्ष',
    commandCenter: 'नियंत्रण कक्ष ट्राइएज एवं राहत अभियान',
    meshActive: 'मेश नेटवर्क सक्रिय',
    drillBannerText: 'अभ्यास / मॉक ड्रिल जारी है - वास्तविक आपदा नहीं है',
    drillBannerSub: 'सिम्युलेटेड उत्तरजीवी टेलीमेट्री और ड्रिल प्रतिक्रिया मोड।',
    offlineBannerText: 'नेटवर्क ऑफ़लाइन - सहेजे गए डेटा पर कार्य जारी है। पुनः जुड़ रहे हैं...',
    navMap: 'ट्राइएज मानचित्र',
    navTeams: 'राहत दल',
    navMetrics: 'अभियान आंकड़े',
    navAdmin: 'प्रशासन',
    navShortcuts: 'शॉर्टकट (?)',
    loginTitle: 'रेस्क्यूनेट नियंत्रण कक्ष प्रवेश',
    loginSubtitle: 'अधिकृत आपदा प्रबंधन कर्मियों हेतु सुरक्षित लॉगिन',
    emailLabel: 'आधिकारिक ईमेल',
    passwordLabel: 'पासवर्ड',
    totpLabel: '6-अंकीय TOTP सुरक्षा कोड',
    totpHelp: 'अपने ऑथेंटिकेटर ऐप से 2FA कोड दर्ज करें',
    loginButton: 'प्रमाणित करें एवं प्रवेश करें',
    logoutButton: 'लॉग आउट',
    quickFill: 'त्वरित डेमो भूमिका चयन:',
    sessionExpiring: 'सत्र शीघ्र समाप्त होने वाला है',
    sessionTimeoutWarning: 'निष्क्रियता के कारण आपका सुरक्षित सत्र 2 मिनट में समाप्त हो जाएगा।',
    stayLoggedIn: 'सत्र जारी रखें',
    priorityCritical: 'अति-गंभीर',
    priorityHigh: 'उच्च',
    priorityMedium: 'मध्यम',
    priorityLow: 'सामान्य',
    stateNew: 'नया SOS',
    stateAssigned: 'दल नियुक्त',
    stateEnRoute: 'रास्ते में',
    stateReached: 'घटनास्थल पर',
    stateClosed: 'सुलझाया गया',
    stateFalseAlarm: 'गलत सूचना',
    queueTitle: 'प्राथमिकता ट्राइएज कतार',
    queueSubtitle: 'उत्तरजीवी तात्कालिकता स्कोर के अनुसार क्रमित',
    searchPlaceholder: 'क्लस्टर आईडी, स्थान या मंजिल खोजें...',
    filterAll: 'सभी स्थितियां',
    filterNeeds: 'आवश्यकताएं',
    filterFlags: 'टेलीमेट्री संकेत',
    filterState: 'स्थिति',
    filterRegion: 'क्षेत्र',
    peopleCount: 'उत्तरजीवी',
    score: 'स्कोर',
    lastSeen: 'नवीनता',
    assignedTo: 'राहत दल',
    noClustersFound: 'कोई क्लस्टर नहीं मिला।',
    drawerTitle: 'उत्तरजीवी क्लस्टर विवरण',
    tabOverview: 'सारांश',
    tabScoreBreakdown: 'स्कोर विश्लेषण',
    tabTrust: 'विश्वसनीयता एवं सुरक्षा',
    tabTimeline: 'समयक्रम',
    tabPackets: 'कच्चे पैकेट',
    tabChat: 'क्षेत्रीय संदेश',
    memberLocations: 'क्लस्टर बीकन फैलाव (लघु मानचित्र)',
    actionsHeader: 'नियंत्रण आदेश (मानवीय सत्यापन)',
    btnAssignTeam: 'राहत दल नियुक्त करें',
    btnSendAck: 'हस्ताक्षरित पावती (ACK) भेजें',
    btnChangeState: 'स्थिति बदलें',
    btnMarkFalseAlarm: 'गलत चेतावनी दर्ज करें',
    btnMergeSplit: 'विलय / विभाजन',
    btnAddNote: 'रणनीतिक नोट जोड़ें',
    btnRequestSecondTeam: 'दूसरा दल अनुरोध करें (>10 उत्तरजीवी)',
    ackTemplateHelp: 'सहायता रास्ते में है। राहत दल भेजा जा चुका है।',
    ackTemplateStay: 'वर्तमान स्थान पर ही सुरक्षित रहें।',
    ackTemplateMove: 'सुरक्षित राहत केंद्र की ओर बढ़ें।',
    ackTemplateInfo: 'और जानकारी की आवश्यकता है। कृपया विवरण भेजें।',
    etaLabel: 'अनुमानित आगमन समय (मिनट)',
    minutes: 'मिनट',
    confirmActionTitle: 'कार्रवाई की पुष्टि करें',
    confirmActionBody: 'क्या आप इस आदेश को भेजना चाहते हैं? 10 सेकंड का पूर्ववत (Undo) विकल्प मिलेगा।',
    btnConfirm: 'पुष्टि करें एवं भेजें',
    btnCancel: 'रद्द करें',
    undoText: 'कार्रवाई सफलतापूर्वक निष्पादित हुई।',
    btnUndo: 'पूर्ववत करें (Undo)',
    falseAlarmReasonRequired: 'गलत सूचना चिन्हित करने हेतु अनिवार्य कारण आवश्यक है।',
    falseAlarmReasonPlaceholder: 'सत्यापन कारण दर्ज करें (उदा. डुप्लिकेट बीकन, फील्ड जांच पुष्टि)...',
    privacyRestricted: '[केवल अधिकृत बचावकर्मियों के लिए सुरक्षित]',
    privacyNotice: 'सटीक निर्देशांक एनडीआरएफ गोपनीयता दिशानिर्देशों के तहत ऑडिट किए जाते हैं।',
    layersTitle: 'मानचित्र परतें',
    layerTeams: 'राहत दल',
    layerHeatmap: 'रिपोर्ट घनत्व हीटमैप',
    layerBoundary: 'आपदा क्षेत्र सीमा',
    layerGateways: 'मेश एवं SMS गेटवे',
    replayTimeSlider: 'घटनाक्रम पुनः-चलाएं (Time Travel)',
    teamsTitle: 'राहत दल रोस्टर एवं स्थिति',
    teamsSubtitle: 'क्षेत्रीय कर्मियों की लाइव स्थिति और कार्यभार',
    metricsTitle: 'अभियान एवं मेश प्रदर्शन आंकड़े',
    metricsSubtitle: '/v1/stats से लाइव टेलीमेट्री डेटा',
    btnExportCsv: 'CSV निर्यात करें',
    btnExportPdf: 'स्थिति रिपोर्ट प्रिंट करें (PDF)',
    adminTitle: 'नियंत्रण कक्ष प्रशासन एवं सुरक्षा',
    tabUsers: 'उपयोगकर्ता एवं भूमिकाएं',
    tabAgencies: 'एजेंसियां एवं CA कुंजी रोटेशन',
    tabSms: 'SMS गेटवे नंबर',
    tabWeights: 'ट्राइएज भार समायोजन',
    tabRetention: 'डेटा प्रतिधारण एवं निष्कासन',
    tabAudit: 'ऑडिट लॉग दृश्य',
    highContrast: 'उच्च कंट्रास्ट मोड',
    largeType: 'बड़ा टेक्स्ट मोड',
    audioAlerts: 'गंभीर क्लस्टर ध्वनि चेतावनी',
    soundMuted: 'मौन',
    soundUnmuted: 'सक्रिय',
    langToggle: 'English',
    shortcutsTitle: 'नियंत्रण कक्ष कीबोर्ड शॉर्टकट',
    shortcutsClose: 'बंद करें (Esc)',
  },
};
