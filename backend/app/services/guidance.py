from dataclasses import dataclass

from app.services.labels import ACTION_LABELS
from app.services.memory.base import MerchantContext

TEMPLATES = {
    "reposition_paytm_qr": {
        "en": "Namaste {name} ji, please place the Paytm QR next to the billing counter so customers can see it clearly.",
        "hi": "नमस्ते {name} जी, Paytm QR को बिलिंग काउंटर के पास रखिए ताकि ग्राहकों को साफ़ दिखे।",
        "mr": "नमस्कार {name} जी, Paytm QR बिलिंग काउंटरजवळ ठेवा म्हणजे ग्राहकांना स्पष्ट दिसेल.",
    },
    "clear_qr_obstruction": {
        "en": "Namaste {name} ji, please remove items blocking the Paytm QR so customers can scan it easily.",
        "hi": "नमस्ते {name} जी, Paytm QR के सामने रखा सामान हटा दीजिए ताकि ग्राहक आसानी से स्कैन कर सकें।",
        "mr": "नमस्कार {name} जी, Paytm QR समोरचे सामान काढा म्हणजे ग्राहकांना सहज स्कॅन करता येईल.",
    },
    "install_soundbox": {
        "en": "Namaste {name} ji, please keep the Paytm Soundbox switched on at the counter so every payment is confirmed aloud.",
        "hi": "नमस्ते {name} जी, Paytm साउंडबॉक्स को काउंटर पर चालू रखिए ताकि हर पेमेंट की आवाज़ सुनाई दे।",
        "mr": "नमस्कार {name} जी, Paytm साउंडबॉक्स काउंटरवर चालू ठेवा म्हणजे प्रत्येक पेमेंटची आवाजात खात्री होईल.",
    },
    "replace_damaged_qr": {
        "en": "Namaste {name} ji, your Paytm QR looks damaged; our representative will replace it.",
        "hi": "नमस्ते {name} जी, आपका Paytm QR खराब दिख रहा है, हमारे प्रतिनिधि इसे बदल देंगे।",
        "mr": "नमस्कार {name} जी, तुमचा Paytm QR खराब दिसतो आहे, आमचे प्रतिनिधी तो बदलून देतील.",
    },
    "reduce_competitor_dominance": {
        "en": "Namaste {name} ji, please display the Paytm QR at the front of the counter where customers pay.",
        "hi": "नमस्ते {name} जी, Paytm QR को काउंटर पर सबसे आगे लगाइए जहाँ ग्राहक पेमेंट करते हैं।",
        "mr": "नमस्कार {name} जी, Paytm QR काउंटरवर सर्वात पुढे लावा जिथे ग्राहक पेमेंट करतात.",
    },
}
REPEAT_LINE = {
    "en": " We noticed the same issue on our last visit.",
    "hi": " पिछली विज़िट में भी यही समस्या दिखी थी।",
    "mr": " मागील भेटीतही हीच समस्या दिसली होती.",
}


@dataclass(frozen=True)
class Guidance:
    action: str
    issue: str
    text_en: str
    text_local: str
    language: str


def lang_key(language: str) -> str:
    return language.split("-")[0] if language.split("-")[0] in ("hi", "mr") else "en"


def pick_action(audit) -> str:
    if audit.recommended_action in TEMPLATES:
        return audit.recommended_action
    if not audit.soundbox_visible:
        return "install_soundbox"
    if audit.qr_obstructed:
        return "clear_qr_obstruction"
    return "reposition_paytm_qr"


def build_guidance(merchant, audit, ctx: MerchantContext | None) -> Guidance:
    action = pick_action(audit)
    first_name = merchant.owner_name.split()[0]
    key = lang_key(merchant.language)
    text_en = TEMPLATES[action]["en"].format(name=first_name)
    text_local = TEMPLATES[action][key].format(name=first_name)
    if ctx and ctx.previous_interventions and ctx.previous_interventions[0] == action:
        text_en += REPEAT_LINE["en"]
        text_local += REPEAT_LINE[key]
    return Guidance(action, ACTION_LABELS[action], text_en, text_local, merchant.language)
