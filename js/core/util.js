/**
 * Customer 360 — small shared helpers
 * -----------------------------------
 * Formatting, date maths and DOM escaping. No business logic lives here.
 */

"use strict";

C360.util = (function () {

    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    /** Parse anything date-ish into a Date, or null. Never throws. */
    function toDate(value) {
        if (!value) { return null; }
        if (value instanceof Date) { return isNaN(value.getTime()) ? null : value; }
        var d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    /** "Aug 18, 2026" — or the caller's fallback when the date is missing. */
    function formatDate(value, fallback) {
        var d = toDate(value);
        if (!d) { return fallback === undefined ? "Not available" : fallback; }
        return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    }

    /** "Aug 18, 2026 3:15 PM" — used for the last-updated stamp. */
    function formatDateTime(value) {
        var d = toDate(value);
        if (!d) { return "Not available"; }
        var hours = d.getHours();
        var suffix = hours >= 12 ? "PM" : "AM";
        var display = hours % 12;
        if (display === 0) { display = 12; }
        var minutes = d.getMinutes() < 10 ? "0" + d.getMinutes() : String(d.getMinutes());
        return formatDate(d) + " " + display + ":" + minutes + " " + suffix;
    }

    /** Whole days between a date and now. Negative for future dates. */
    function daysAgo(value, now) {
        var d = toDate(value);
        if (!d) { return null; }
        var ref = toDate(now) || new Date();
        return Math.floor((ref.getTime() - d.getTime()) / 86400000);
    }

    /** "3 days ago" / "Today" / "in 2 days". Null-safe. */
    function relativeDays(value, now) {
        var n = daysAgo(value, now);
        if (n === null) { return "Not available"; }
        if (n === 0) { return "Today"; }
        if (n === 1) { return "Yesterday"; }
        if (n < 0) { return "in " + Math.abs(n) + " days"; }
        return n + " days ago";
    }

    /** Which recency bucket a date falls in (spec section 16). */
    function recencyBucket(value, now) {
        var n = daysAgo(value, now);
        if (n === null) { return "unknown"; }
        if (n <= 30) { return "last30"; }
        if (n <= 90) { return "last90"; }
        if (n <= 182) { return "last6m"; }
        if (n <= 365) { return "last12m"; }
        return "older";
    }

    /**
     * Money, formatted for display. Returns "Not available" for a missing
     * amount rather than inventing a zero.
     */
    function formatMoney(amount, currency) {
        if (amount === null || amount === undefined || isNaN(Number(amount))) {
            return "Not available";
        }
        var n = Number(amount);
        var code = currency || "USD";
        try {
            return new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: code,
                maximumFractionDigits: 0
            }).format(n);
        } catch (e) {
            // Unknown currency code — fall back to a plain grouped number.
            return code + " " + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
        }
    }

    /** Percentage change from `from` to `to`, or null when it is undefined. */
    function pctChange(from, to) {
        if (!from || from <= 0 || to === null || to === undefined) { return null; }
        return (to - from) / from;
    }

    /** "28%" from 0.28. Always absolute — the caller supplies the direction. */
    function formatPct(fraction) {
        if (fraction === null || fraction === undefined) { return "Not available"; }
        return Math.round(Math.abs(fraction) * 100) + "%";
    }

    /**
     * Escape text for interpolation into innerHTML.
     *
     * The dashboard renders strings that originate from external web research,
     * so this is a genuine XSS boundary, not decoration. Every template in
     * ui/ passes source-supplied text through here.
     */
    function escapeHtml(value) {
        if (value === null || value === undefined) { return ""; }
        return String(value)
            .split("&").join("&amp;")
            .split("<").join("&lt;")
            .split(">").join("&gt;")
            .split('"').join("&quot;")
            .split("'").join("&#39;");
    }

    /**
     * Escape a URL for an href. Anything that is not plainly http(s) is
     * dropped, so a "javascript:" URL from a research source cannot execute.
     */
    function safeUrl(value) {
        if (!value) { return ""; }
        var s = String(value).trim();
        return /^https?:\/\//i.test(s) ? escapeHtml(s) : "";
    }

    /** Hostname only, for compact source labels. */
    function hostOf(url) {
        if (!url) { return ""; }
        try {
            return new URL(url).hostname.replace(/^www\./, "");
        } catch (e) {
            return "";
        }
    }

    /** Sort comparator: newest first. Items with no date sink to the bottom. */
    function byDateDesc(a, b) {
        var da = toDate(a && a.date);
        var db = toDate(b && b.date);
        if (!da && !db) { return 0; }
        if (!da) { return 1; }
        if (!db) { return -1; }
        return db.getTime() - da.getTime();
    }

    /** Array-safe: always hands back an array, never undefined. */
    function list(value) {
        return Array.isArray(value) ? value : [];
    }

    /** Readable label for a machine value ("at_risk" -> "At risk"). */
    function humanize(value) {
        if (!value) { return ""; }
        var s = String(value).replace(/[_-]+/g, " ").trim();
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    /** Pluralise a count: (1,"ticket") -> "1 ticket". */
    function plural(count, singular, pluralForm) {
        var word = count === 1 ? singular : (pluralForm || singular + "s");
        return count + " " + word;
    }

    /** Stable id generator for generated intelligence items. */
    function slug(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    }

    return {
        toDate: toDate,
        formatDate: formatDate,
        formatDateTime: formatDateTime,
        daysAgo: daysAgo,
        relativeDays: relativeDays,
        recencyBucket: recencyBucket,
        formatMoney: formatMoney,
        pctChange: pctChange,
        formatPct: formatPct,
        escapeHtml: escapeHtml,
        safeUrl: safeUrl,
        hostOf: hostOf,
        byDateDesc: byDateDesc,
        list: list,
        humanize: humanize,
        plural: plural,
        slug: slug
    };
}());
