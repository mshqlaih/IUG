// help.js — زرّ ❔ «شرح الشاشة» (نسخة ScreenHelpButton + help_catalog.dart في أندرويد).
//
// كان تحت عنوان كل شاشة سطرُ شرحٍ ثابت يأخذ مكانًا ولا يقرؤه أحدٌ بعد أوّل مرّة.
// الآن: ❔ بجانب العنوان (`<button class="help-btn" data-help="<topic>">`)
// يفتح نافذةً بخطوات، ونقطةٌ صفراء عليه حتى يُفتح مرّة.
// رفعُ `v` في موضوعٍ يعيد النقطة للجميع (شرحٌ تغيّر).
// العلَم في localStorage `help_seen:<topic>_v<n>` — بيانات جهازٍ لا مستخدم.

const HELP_TOPICS = {
    activity: {
        v: 1, icon: 'fa-pen-to-square', title: 'تسجيل النشاط',
        intro: 'سجّل تسميع الطالب أو مراجعته أو اختباره في الحلقة.',
        steps: [
            ['fa-user', 'اختر الطالب', 'اكتب جزءًا من اسمه أو رقمه واختره من القائمة.'],
            ['fa-icons', 'اختر نوع النشاط', 'من الأيقونات: تسميع، مراجعة، اختبار…'],
            ['fa-book-quran', 'حدّد الآيات', 'اكتب «من» و«إلى» (مثلًا: بقرة 155)، أو اضغط «من المصحف» ثم اضغط آية البداية وآية النهاية.'],
            ['fa-star', 'أكمل التقييم', 'عدد الأخطاء والتقييم، ثم «حفظ النشاط».'],
            ['fa-wifi', 'دون اتصال', 'يُحفظ على الجهاز ويُرفع حين يعود الاتصال، أو من «مزامنة البيانات».'],
        ],
    },
    students: {
        v: 1, icon: 'fa-users', title: 'طلابي',
        intro: 'طلاب حلقتك، ومن لم يُسمّع منذ فترة يظهر أوّلًا.',
        steps: [
            ['fa-magnifying-glass', 'ابحث', 'بالاسم أو رقم الهوية أو رقم الطالب.'],
            ['fa-hand-pointer', 'سجّل من البطاقة', 'أيقونات التسميع والمراجعة تفتح شاشة النشاط والطالب مختار؛ وأيقونات المجموعة الأخيرة تُحفظ فورًا.'],
            ['fa-clipboard-check', 'رشّح للاختبار', 'الأيقونة البرتقالية في البطاقة تفتح نموذج الترشيح للطالب.'],
            ['fa-user-plus', 'طالب جديد', 'يحتاج اتصالًا، لأن السيرفر هو من يُصدر رقم الطالب.'],
        ],
    },
    logs: {
        v: 1, icon: 'fa-chart-line', title: 'تقرير الأنشطة',
        intro: 'كل الأنشطة المسجّلة على هذا الجهاز وما سُحب من السيرفر.',
        steps: [
            ['fa-filter', 'صفِّ السجلات', 'بالتاريخ أو باسم الطالب ورقمه، و«إعادة تعيين» يُظهرها كلّها.'],
            ['fa-pen', 'عدّل أو احذف', 'من أيقونتَي العمود «إجراءات» في كل سطر.'],
            ['fa-cloud-arrow-up', 'المزامنة', '«مزامنة البيانات» يرفع ما لم يُرفع، و«سحب البيانات» يجلب طلاب الحلقة وأنشطتها. العمود «حالة المزامنة» يقول أيّ سطرٍ لم يُرفع بعد.'],
            ['fa-file-export', 'صدّر وشارك', 'الأيقونات أعلى البطاقة: Excel، تنزيل PDF، مشاركة PDF، مشاركة نصّية (واتساب).'],
        ],
    },
    requests: {
        v: 1, icon: 'fa-clipboard-check', title: 'الطلبات',
        intro: 'ترشيح طلابك لاختبار الأجزاء، ومتابعة حالة ما رشّحت.',
        steps: [
            ['fa-user-plus', 'رشّح طالبًا', '«ترشيح طالب» ← اختر الطالب ونوع الاختبار والأجزاء من وإلى ← «ترشيح للاختبار».'],
            ['fa-hourglass-half', 'تابع الحالة', 'كل ترشيحٍ بطاقةٌ بحالته.'],
            ['fa-pen', 'عدّل أو احذف', 'ما دامت حالة الطلب «معلّق» فقط.'],
        ],
    },
    courses: {
        v: 1, icon: 'fa-graduation-cap', title: 'اختبارات الدورات',
        intro: 'أنشئ الدورة، سجّل طلابها، ثم ارصد درجاتهم.',
        steps: [
            ['fa-plus', 'دورة جديدة', 'الاسم والتصنيف والمركز والأيام والمدرّس. يحتاج اتصالًا، فرقم الدورة يصدره السيرفر.'],
            ['fa-user-plus', 'سجّل الطلبة', 'افتح الدورة ← «تسجيل طلبة».'],
            ['fa-marker', 'ارصد الدرجات', 'من كشف الدورة، واطبع الكشف من «طباعة الكشف».'],
        ],
    },
    svCenters: {
        v: 1, icon: 'fa-building-columns', title: 'إشراف الدورات',
        intro: 'المواضع التي تُعقد فيها الدورات.',
        steps: [
            ['fa-building', 'افتح موضعًا', 'لترى دوراته، ومن الدورة كشفها وحضورها واعتماد نتائجها.'],
            ['fa-magnifying-glass', 'البحث عن متدرّب', 'وسجلّه في الدورات كلّها.'],
            ['fa-chart-column', 'الحاصلون والمعلّمون', 'قوائم تُصدَّر إلى Excel.'],
        ],
    },
    myCourses: {
        v: 1, icon: 'fa-chalkboard-user', title: 'دوراتي',
        intro: 'الدورات التي تدرّسها.',
        steps: [
            ['fa-user-check', 'رصد الحضور', 'يعمل دون اتصال، ويُرفع لاحقًا.'],
            ['fa-user-plus', 'إضافة الطلاب', 'من بطاقة الدورة. حذف تسجيلٍ من صلاحية إدارة الدورات.'],
            ['fa-square-poll-vertical', 'النتائج', 'تظهر بعد اعتماد المشرف.'],
        ],
    },
    settings: {
        v: 1, icon: 'fa-gear', title: 'الإعدادات',
        intro: 'بياناتك وحلقاتك، والمظهر، وأدوات المزامنة والصيانة.',
        steps: [
            ['fa-rotate', 'تحديث بياناتي', 'إن تغيّرت حلقتك أو مركزك على السيرفر.'],
            ['fa-palette', 'المظهر', 'اللون والوضع الليلي وحجم الخطّ، ويتبع حسابك على أندرويد أيضًا.'],
            ['fa-cloud', 'المزامنة', 'رفع السجلات وسحب البيانات.'],
            ['fa-broom', 'صيانة البيانات', 'إن ظهرت أسماء ناقصة أو طلاب مكرّرون — لا يعمل ما دام سجلٌّ لم يُرفع.'],
        ],
    },
};

function _helpSeenKey(topic) {
    return `help_seen:${topic}_v${HELP_TOPICS[topic].v}`;
}

function _helpSeen(topic) {
    try { return localStorage.getItem(_helpSeenKey(topic)) === '1'; } catch (_) { return true; }
}

function _helpMarkDots() {
    document.querySelectorAll('.help-btn[data-help]').forEach(b => {
        const t = b.dataset.help;
        if (!HELP_TOPICS[t]) { b.style.display = 'none'; return; }
        b.classList.toggle('unseen', !_helpSeen(t));
    });
}

function openScreenHelp(topic) {
    const h = HELP_TOPICS[topic];
    if (!h) return;
    try { localStorage.setItem(_helpSeenKey(topic), '1'); } catch (_) {}
    _helpMarkDots();

    let ov = document.getElementById('helpModal');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'helpModal';
        ov.className = 'modal-overlay';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.addEventListener('click', e => { if (e.target === ov) closeScreenHelp(); });
        document.body.appendChild(ov);
    }
    const steps = h.steps.map(([icon, head, body], i) => `
        <li class="help-step">
            <span class="help-step-icon"><i class="fas ${icon}"></i></span>
            <div><b>${i + 1}. ${head}</b><div class="help-step-body">${body}</div></div>
        </li>`).join('');
    ov.innerHTML = `
        <div class="modal-box help-box">
            <div class="help-head"><i class="fas ${h.icon}"></i> ${h.title}</div>
            <div class="help-intro">${h.intro}</div>
            <ol class="help-steps">${steps}</ol>
            <div class="modal-actions">
                <button type="button" class="modal-btn modal-confirm" onclick="closeScreenHelp()">فهمت</button>
            </div>
        </div>`;
    ov.style.display = 'flex';
}

function closeScreenHelp() {
    const ov = document.getElementById('helpModal');
    if (ov) ov.style.display = 'none';
}

document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.help-btn[data-help]');
    if (b) { e.preventDefault(); openScreenHelp(b.dataset.help); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeScreenHelp(); });

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _helpMarkDots);
} else {
    _helpMarkDots();
}
