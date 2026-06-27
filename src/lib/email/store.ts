import emailDB from "@/lib/db/email";
import extract from "./extract";
import sendWebhook from '@/lib/webhook/webhook'
import sendTelegramMessage from '@/lib/telegram/telegram'
import PostalMime from "postal-mime";
import * as cheerio from 'cheerio';
import { DEFAULT_EXTRACT_RESULT } from "@/types";
import type { Email, NewEmail } from "@/types";

/**
 * 递归替换模板中的占位符 {{key}} 为 email 对象中对应的值
 * @param template - JSON 模板字符串，包含 {{key}} 格式的占位符
 * @param email - 包含替换数据的 Email 对象
 * @returns 替换后的 JSON 字符串
 */
function replaceTemplateAdvanced(template: string, email: Email): string {
    try {
        // 解析模板为对象
        const templateObj: unknown = JSON.parse(template);
        
        /**
         * 递归替换所有字符串中的占位符
         * 使用泛型和类型守卫确保类型安全
         */
        function replaceValues<T>(obj: T): T {
            // 处理字符串：替换占位符
            if (typeof obj === 'string') {
                return obj.replace(/\{\{(\w+)\}\}/g, (_, key) => {
                    const value = email[key as keyof Email];
                    return value !== null && value !== undefined ? String(value) : '';
                }) as T;
            }
            
            // 处理数组：递归处理每个元素
            if (Array.isArray(obj)) {
                return obj.map(item => replaceValues(item)) as T;
            }
            
            // 处理普通对象：递归处理每个属性
            if (obj && typeof obj === 'object') {
                const result: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(obj)) {
                    result[key] = replaceValues(value);
                }
                return result as T;
            }
            
            // 其他类型（null, number, boolean 等）直接返回
            return obj;
        }
        
        // 执行替换
        const replaced = replaceValues(templateObj);
        
        // 序列化为 JSON 字符串，自动转义特殊字符
        return JSON.stringify(replaced);
        
    } catch (error) {
        // 详细的错误日志
        console.error('template replace failed:', {
            error: error instanceof Error ? error.message : String(error),
            templatePreview: template.slice(0, 200) + (template.length > 200 ? '...' : ''),
            templateLength: template.length
        });
        
        // 返回包含错误信息的 JSON，避免整个流程中断
        return JSON.stringify({
            error: 'template parse failed',
            message: error instanceof Error ? error.message : 'unknow error'
        });
    }
}

export default async function storeEmail(
    message: ForwardableEmailMessage,
    env: CloudflareEnv
): Promise<void> {
    try {
        const reader = message.raw.getReader();
        let content = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            content += new TextDecoder().decode(value);
        }

        const email = await PostalMime.parse(content);

        const $ = cheerio.load(email.html || "")
        $('script').remove();
        $('style').remove();
        $('a').each(function () {
            const $elem = $(this);
            const href = $elem.attr('href');
            const text = $elem.text().trim();

            if (href && text) {
                $elem.replaceWith(`[${text}](${href})`);
            } else if (href) {
                $elem.replaceWith(href);
            }
        });
        const emailText = $('body').text().replace(/\s+/g, ' ').trim();

        const allContent = [email.subject || '', email.text || '', emailText].filter(Boolean).join('\n');

        const result = env.ENABLE_AI_EXTRACT?.trim().toLowerCase() === 'true'
            ? await extract(allContent, env)
            : DEFAULT_EXTRACT_RESULT;

        console.log(result.type, result.result, result.result_text);

        const emailFromAddress = email.from?.address || message.from || null;
        const emailFromName = email.from?.name || (emailFromAddress ? emailFromAddress.split("@")[0] : null);
        const emailData: NewEmail = {
            messageId: email.messageId || null,
            fromAddress: emailFromAddress,
            fromName: emailFromName,
            toAddress: email.deliveredTo || message.to,
            recipient: JSON.stringify(email.to),
            title: email.subject || null,
            bodyText: email.text || "",
            bodyHtml: email.html || "",
            sentAt: email.date || null,
            receivedAt: new Date().toISOString(),
            emailType: result.type,
            emailResult: result.result || "",
            emailResultText: result.result_text || "",
            emailError: null,
            readStatus: 0,
        };

        const res = await emailDB.create(env, emailData);

        if (env.WEBHOOK_URL && env.WEBHOOK_TEMPLATE && env.WEBHOOK_TYPE.split(',').includes(emailData.emailType)) {
            await sendWebhook(replaceTemplateAdvanced(env.WEBHOOK_TEMPLATE, res), env.WEBHOOK_URL);
        }

        // 发送到Telegram Bot
        if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && env.TELEGRAM_TEMPLATE && env.TELEGRAM_TYPE && env.TELEGRAM_TYPE.split(',').includes(emailData.emailType)) {
            await sendTelegramMessage(
                replaceTemplateAdvanced(env.TELEGRAM_TEMPLATE, res),
                env.TELEGRAM_BOT_TOKEN,
                env.TELEGRAM_CHAT_ID
            );
        }
        console.log("Email stored successfully:", {
            id: res.id,
            messageId: emailData.messageId,
            from: emailData.fromAddress,
            to: emailData.toAddress,
            emailType: emailData.emailType,
        });
    } catch (e) {
        console.error("Failed to store email:", e);
        throw e;
    }
}
