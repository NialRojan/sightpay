import { createContext, useContext, useEffect, useState } from 'react'

const languages = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' }
const LanguageContext = createContext(null)
const storageKey = 'sightpay.language'

const copy = {

  'Priority alerts': ['प्राथमिकता सूचनाएँ', 'प्राधान्य सूचना'],
  'Merchant Visit': ['व्यापारी का दौरा', 'व्यापाऱ्याची भेट'],
  'Capture Evidence': ['प्रमाण दर्ज करें', 'पुरावा नोंदवा'],
  'Retry GPS': ['GPS फिर चालू करें', 'GPS पुन्हा वापरा'],
  'Submit and analyze': ['भेजें और जाँच करें', 'पाठवा आणि तपासा'],
  'Uploading…': ['अपलोड हो रहा है…', 'अपलोड होत आहे…'],
  'Competitor QR dominance': ['प्रतिस्पर्धी का क्यूआर ज़्यादा प्रमुख है', 'स्पर्धकाचा क्यूआर अधिक ठळक आहे'],
  'First audit of the counter': ['काउंटर की पहली जाँच', 'काउंटरची पहिली तपासणी'],
  'Routine check (last visit compliant)': ['नियमित जाँच (पिछला दौरा ठीक था)', 'नियमित तपासणी (मागील भेट निकषांनुसार होती)'],
  'AI Audit': ['एआई जाँच', 'एआय तपासणी'],
  'Good morning': ['सुप्रभात', 'सुप्रभात'],
  'Good afternoon': ['नमस्कार', 'नमस्कार'],
  'Good evening': ['शुभ संध्या', 'शुभ संध्याकाळ'],
  'Field rep': ['फील्ड अधिकारी', 'क्षेत्रीय अधिकारी'],
  'Field Sales Executive': ['फील्ड बिक्री अधिकारी', 'क्षेत्रीय विक्री अधिकारी'],
  'Admin / Manager Panel': ['प्रबंधक पैनल', 'व्यवस्थापक पॅनेल'],
  'Continue as field rep': ['फील्ड अधिकारी के रूप में आगे बढ़ें', 'क्षेत्रीय अधिकारी म्हणून पुढे जा'],
  'Enter Manager Command Center': ['प्रबंधक केंद्र खोलें', 'व्यवस्थापक केंद्र उघडा'],
  'Choose your name to see today’s visits.': ['आज के दौरे देखने के लिए अपना नाम चुनें।', 'आजच्या भेटी पाहण्यासाठी तुमचे नाव निवडा.'],
  'Review flagged visits and team performance.': ['चिह्नित दौरों और टीम के प्रदर्शन की समीक्षा करें।', 'चिन्हांकित भेटी आणि संघाच्या कामगिरीचे पुनरावलोकन करा.'],
  'Log out': ['साइन आउट करें', 'साइन आउट करा'],
  'Open today’s plan': ['आज की योजना खोलें', 'आजची योजना उघडा'],
  'Switch rep': ['अधिकारी बदलें', 'अधिकारी बदला'],
  'Counter Audit': ['काउंटर की जाँच', 'काउंटरची तपासणी'],
  'Visit Verification': ['दौरे की पुष्टि', 'भेटीची पडताळणी'],
  'Action Pipeline': ['कार्रवाई के चरण', 'कृतीचे टप्पे'],
  'Audit a photo': ['फ़ोटो की जाँच करें', 'फोटो तपासा'],
  'Flagged visits': ['चिह्नित दौरे', 'चिन्हांकित भेटी'],
  'Recent visit audits': ['हाल की दौरा जाँच', 'अलीकडील भेट तपासण्या'],
  'Live measurement': ['लाइव मापन', 'थेट मोजमाप'],
  'Evidence details': ['प्रमाण का विवरण', 'पुराव्यांचा तपशील'],
  'Visit timeline': ['दौरे का क्रम', 'भेटीचा घटनाक्रम'],
  'Merchant guidance': ['व्यापारी के लिए निर्देश', 'व्यापाऱ्यासाठी मार्गदर्शन'],
  'View AI Audit': ['एआई जाँच देखें', 'एआय तपासणी पाहा'],
  'How it works': ['यह कैसे काम करता है', 'हे कसे काम करते'],
  'Product': ['उत्पाद', 'उत्पादन'],
  'AI stack': ['एआई तकनीक', 'एआय तंत्रज्ञान'],
  'For managers': ['प्रबंधकों के लिए', 'व्यवस्थापकांसाठी'],
  'Enter SightPay': ['SightPay खोलें', 'SightPay उघडा'],
  'Pick a field rep': ['फील्ड अधिकारी चुनें', 'क्षेत्रीय अधिकारी निवडा'],
  'Your name (recorded as the approver)': ['आपका नाम (स्वीकर्ता के रूप में दर्ज होगा)', 'तुमचे नाव (मंजुरी देणारे म्हणून नोंदवले जाईल)'],
  'Open Latest Visit': ['सबसे हाल का दौरा खोलें', 'सर्वात अलीकडील भेट उघडा'],
  'Transactions Before / After Guidance': ['निर्देश से पहले और बाद के लेनदेन', 'मार्गदर्शनापूर्वी आणि नंतरचे व्यवहार'],
  'Priority': ['प्राथमिकता', 'प्राधान्य'],
  'Distance': ['दूरी', 'अंतर'],
  'QR Score': ['क्यूआर स्कोर', 'क्यूआर गुण'],
  'Trend': ['रुझान', 'कल'],
  'Loading operations…': ['फील्ड डैशबोर्ड लोड हो रहा है…', 'क्षेत्रीय डॅशबोर्ड लोड होत आहे…'],
  'Checking location…': ['स्थान खोज रहे हैं…', 'स्थान शोधत आहे…'],
  'Distance included': ['दूरी शामिल है', 'अंतर समाविष्ट आहे'],
  'Workspace': ['कार्यस्थल', 'कार्यक्षेत्र'],
  'Menu': ['मेनू', 'मेनू'],
  'Switch role': ['भूमिका बदलें', 'भूमिका बदला'],
  'Overview': ['सारांश', 'आढावा'],
  'Field': ['फील्ड कार्य', 'क्षेत्रीय काम'],
  'Intelligence': ['विश्लेषण', 'विश्लेषण'],
  'Management': ['प्रबंधन', 'व्यवस्थापन'],
  'Operations': ['फील्ड डैशबोर्ड', 'क्षेत्रीय डॅशबोर्ड'],
  'Priority Queue': ['प्राथमिकता सूची', 'प्राधान्य यादी'],
  'Merchants': ['व्यापारी', 'व्यापारी'],
  'Mobile Copilot': ['मोबाइल सहायक', 'मोबाइल सहाय्यक'],
  'AI Audits': ['एआई जाँच', 'एआय तपासणी'],
  'Visit Evidence': ['दौरे के प्रमाण', 'भेटीचे पुरावे'],
  'Visit Audit': ['दौरे की जाँच', 'भेटीची तपासणी'],
  'Visit Audit & Verification': ['दौरे की जाँच और पुष्टि', 'भेटीची तपासणी व पडताळणी'],
  'Merchant': ['व्यापारी', 'व्यापारी'],
  'Impact': ['प्रभाव', 'परिणाम'],
  'Command Center': ['प्रबंधक केंद्र', 'व्यवस्थापक केंद्र'],
  'Manager Command Center': ['प्रबंधक केंद्र', 'व्यवस्थापक केंद्र'],
  'Impact analytics': ['प्रभाव का विश्लेषण', 'परिणामांचे विश्लेषण'],
  'Next Best Visit': ['अगला प्राथमिक दौरा', 'पुढील प्राधान्य भेट'],
  'Start visit': ['दौरा शुरू करें', 'भेट सुरू करा'],
  'View merchant': ['व्यापारी का विवरण', 'व्यापाऱ्याचा तपशील'],
  'Today’s visits': ['आज के दौरे', 'आजच्या भेटी'],
  'View all': ['सभी देखें', 'सर्व पाहा'],
  'Activity and performance': ['गतिविधि और प्रदर्शन', 'कामकाज आणि कामगिरी'],
  'Visit Activity': ['दौरों की गतिविधि', 'भेटींची नोंद'],
  'Merchant Health': ['व्यापारी की स्थिति', 'व्यापाऱ्याची स्थिती'],
  'AI Alerts': ['एआई सूचनाएँ', 'एआय सूचना'],
  'Recent Incentives': ['हाल के प्रोत्साहन', 'अलीकडील प्रोत्साहने'],
  'Competitor presence': ['प्रतिस्पर्धी की मौजूदगी', 'स्पर्धकाची उपस्थिती'],
  'Evidence': ['प्रमाण', 'पुरावे'],
  'Recommended action': ['सुझाया गया कदम', 'सुचवलेली कृती'],
  'Why this visit?': ['यह दौरा क्यों?', 'ही भेट का?'],
  'Explain Score': ['स्कोर कैसे बना?', 'गुण कसे ठरले?'],
  'Search merchants': ['व्यापारी खोजें', 'व्यापारी शोधा'],
  'Last visit': ['पिछला दौरा', 'मागील भेट'],
  'All': ['सभी', 'सर्व'],
  'Open issue': ['लंबित समस्या', 'प्रलंबित समस्या'],
  'High': ['उच्च', 'उच्च'],
  'Medium': ['मध्यम', 'मध्यम'],
  'Low': ['कम', 'कमी'],
  'Transaction Decline': ['लेनदेन में गिरावट', 'व्यवहारात घट'],
  'Competitor Risk': ['प्रतिस्पर्धी का जोखिम', 'स्पर्धकाचा धोका'],
  'Never visited': ['कोई दौरा नहीं', 'भेट झालेली नाही'],
  'Nearby': ['आस-पास', 'जवळपास'],
  'Welcome to SightPay': ['SightPay में आपका स्वागत है', 'SightPay मध्ये स्वागत आहे'],
  'Sign in': ['साइन इन करें', 'साइन इन करा'],
  'Launch SightPay': ['SightPay खोलें', 'SightPay उघडा'],
  'Explore SightPay': ['SightPay देखें', 'SightPay पाहा'],
  'View field dashboard': ['फील्ड डैशबोर्ड देखें', 'क्षेत्रीय डॅशबोर्ड पहा'],
  'Turn every field visit into measurable impact.': ['हर फील्ड दौरे का असर मापें।', 'प्रत्येक क्षेत्रीय भेटीचा परिणाम मोजा.'],
  'Field intelligence, at the counter.': ['दुकान के काउंटर पर फील्ड जानकारी।', 'दुकानाच्या काउंटरवर क्षेत्रीय माहिती.'],
  'Operations Manager': ['संचालन प्रबंधक', 'कार्यसंचालन व्यवस्थापक'],
  'Not signed in': ['साइन इन नहीं किया है', 'साइन इन केलेले नाही'],
  'Choose a role to continue': ['आगे बढ़ने के लिए भूमिका चुनें', 'पुढे जाण्यासाठी भूमिका निवडा'],
  'Today': ['आज', 'आज'],
  'Field Officer': ['फील्ड अधिकारी', 'क्षेत्रीय अधिकारी'],
  'Manager': ['प्रबंधक', 'व्यवस्थापक'],
  'Capture photo': ['फ़ोटो लें', 'फोटो काढा'],
  'Back': ['वापस', 'मागे'],
  'Continue': ['आगे बढ़ें', 'पुढे जा'],
  'Loading priority queue…': ['प्राथमिकता सूची लोड हो रही है…', 'प्राधान्य यादी लोड होत आहे…'],
  'Retry': ['फिर कोशिश करें', 'पुन्हा प्रयत्न करा'],
  'Counter Vision Rubric': ['काउंटर जाँच के मानदंड', 'काउंटर तपासणीचे निकष'],
  'Visit Authenticity Score': ['दौरे की प्रामाणिकता का स्कोर', 'भेटीच्या सत्यतेचे गुण'],
  'Choose your workspace': ['अपना कार्यस्थल चुनें', 'तुमचे कार्यक्षेत्र निवडा'],
  'No visits left today.': ['आज कोई दौरा बाकी नहीं है।', 'आज कोणतीही भेट बाकी नाही.'],
  'Location unavailable': ['स्थान उपलब्ध नहीं है', 'स्थान उपलब्ध नाही'],
}

function storedLanguage() {
  try {
    const value = localStorage.getItem(storageKey)
    if (Object.hasOwn(languages, value)) return value
  } catch {
    // The picker also works without storage.
  }
  return 'en'
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(storedLanguage)
  useEffect(() => {
    document.documentElement.lang = language
    try {
      localStorage.setItem(storageKey, language)
    } catch {
      // Keep the current selection for this tab.
    }
  }, [language])
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext)
  const index = language === 'hi' ? 0 : 1
  return { language, setLanguage, t: (label) => language === 'en' ? label : copy[label]?.[index] ?? label }
}

export function T({ children }) {
  return useLanguage().t(children)
}

export function LanguagePicker() {
  const { language, setLanguage } = useLanguage()
  const label = { en: 'Language', hi: 'भाषा', mr: 'भाषा' }[language]
  return (
    <label className="sp-language">
      <span>{label}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value)}>
        {Object.entries(languages).map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
      </select>
    </label>
  )
}
