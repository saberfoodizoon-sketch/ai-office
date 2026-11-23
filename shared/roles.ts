import type { RoleId } from "./types";

export interface RoleInfo {
  id: RoleId;
  title: string;
  titleEn: string;
  color: string;
  /** Words (Arabic + English, lowercase) that point to this role. */
  keywords: string[];
}

export const ROLES: Record<RoleId, RoleInfo> = {
  general_manager: {
    id: "general_manager",
    title: "المدير العام",
    titleEn: "General Manager",
    color: "#3b3f4a",
    keywords: ["general manager", "ceo", "مدير عام", "مدير تنفيذي"],
  },
  hr_manager: {
    id: "hr_manager",
    title: "مديرة الموارد البشرية",
    titleEn: "HR Manager",
    color: "#8e4b7a",
    keywords: ["hr", "human resources", "recruit", "موارد بشرية", "توظيف", "تعيين"],
  },
  product_manager: {
    id: "product_manager",
    title: "مدير منتج",
    titleEn: "Product Manager",
    color: "#2f6fb0",
    keywords: ["product", "pm", "roadmap", "feature", "mvp", "منتج", "خطة", "مميزات", "تطبيق", "app", "مشروع", "فكرة", "startup"],
  },
  copywriter: {
    id: "copywriter",
    title: "كاتب محتوى",
    titleEn: "Copywriter",
    color: "#c0612b",
    keywords: ["copy", "content", "caption", "write", "post", "slogan", "script", "محتوى", "كتابة", "اكتب", "بوست", "كابشن", "سلوجان", "شعار", "سكريبت", "إعلان", "اعلان", "نص"],
  },
  designer: {
    id: "designer",
    title: "مصمم",
    titleEn: "Designer",
    color: "#7a5cc2",
    keywords: ["design", "ui", "ux", "logo", "brand", "visual", "تصميم", "صمم", "لوجو", "هوية", "براند", "ألوان", "الوان", "واجهة"],
  },
  marketer: {
    id: "marketer",
    title: "أخصائي تسويق",
    titleEn: "Marketing Specialist",
    color: "#1f9a8a",
    keywords: ["market", "campaign", "ads", "social", "growth", "seo", "launch", "تسويق", "حملة", "إعلانات", "سوشيال", "انستجرام", "تيك توك", "فيسبوك", "إطلاق", "اطلاق", "جمهور", "عملاء"],
  },
  developer: {
    id: "developer",
    title: "مطوّر",
    titleEn: "Developer",
    color: "#2d8a3e",
    keywords: ["develop", "code", "engineer", "website", "api", "backend", "frontend", "مطور", "برمجة", "كود", "موقع", "سيستم", "نظام", "تطوير"],
  },
  data_analyst: {
    id: "data_analyst",
    title: "محلل بيانات",
    titleEn: "Data Analyst",
    color: "#b08a1f",
    keywords: ["data", "analy", "report", "kpi", "metric", "dashboard", "بيانات", "تحليل", "تقرير", "أرقام", "ارقام", "مؤشرات", "مبيعات الشهر"],
  },
  researcher: {
    id: "researcher",
    title: "باحث",
    titleEn: "Researcher",
    color: "#5a6f80",
    keywords: ["research", "competitor", "study", "survey", "بحث", "منافسين", "دراسة", "سوق", "استبيان"],
  },
  sales: {
    id: "sales",
    title: "مسؤول مبيعات",
    titleEn: "Sales Representative",
    color: "#b23a48",
    keywords: ["sales", "sell", "deal", "lead", "pitch", "مبيعات", "بيع", "عرض سعر", "صفقات", "عملاء محتملين"],
  },
  support: {
    id: "support",
    title: "خدمة عملاء",
    titleEn: "Customer Support",
    color: "#3a8fb7",
    keywords: ["support", "customer service", "faq", "complaint", "خدمة عملاء", "دعم", "شكاوى", "أسئلة شائعة", "رد على"],
  },
  specialist: {
    id: "specialist",
    title: "أخصائي",
    titleEn: "Specialist",
    color: "#6b7280",
    keywords: [],
  },
};

/** Roles the GM can delegate work to (everyone except GM and HR). */
export const WORKER_ROLES: RoleId[] = (Object.keys(ROLES) as RoleId[]).filter(
  (r) => r !== "general_manager" && r !== "hr_manager",
);

export function scoreRole(role: RoleId, text: string): number {
  const t = text.toLowerCase();
  return ROLES[role].keywords.reduce((n, k) => (t.includes(k) ? n + 1 : n), 0);
}

/** Picks the best matching role for a job title + description. */
export function classifyRole(jobTitle: string, jobDescription: string): RoleId {
  let best: RoleId = "specialist";
  let bestScore = 0;
  for (const role of Object.keys(ROLES) as RoleId[]) {
    if (role === "general_manager") continue;
    // The title counts three times as much as the description.
    const s = scoreRole(role, jobTitle) * 3 + scoreRole(role, jobDescription);
    if (s > bestScore) {
      best = role;
      bestScore = s;
    }
  }
  return best;
}
