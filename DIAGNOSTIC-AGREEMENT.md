# Solar System Diagnostic — Service Agreement
## GHL Upload Reference — Solar Review Corp (DBA: FIXMy.Energy)

---

# SOLAR SYSTEM DIAGNOSTIC — SERVICE AGREEMENT

**Solar Review Corp** (DBA: FIXMy.Energy)
License #: 117450
(619) 777-6527 | fixmy.energy

---

**Customer Name:** {{contact.full_name}}
**Phone:** {{contact.phone}}
**Service Address:** {{contact.address1}}
**Email:** {{contact.email}}
**Date:** {{current_date}}
**Agreement #:** {{invoice.number}}
**Service Fee:** ${{custom_field.diagnostic_fee}}

---

## 01. Nature of Diagnostic Service

This service is a professional technical assessment, directional in nature, not a guaranteed repair. Your Solar Review technician and any contractors will begin at the system's foundation (utility interconnect, main service panel, inverter, monitoring) and work systematically toward identifying the source of underperformance or failure.

A diagnosis identifies probable cause(s) based on observed data. Root issues may be layered or compounding, and may require more than one visit to fully characterize.

Additional visits may be required for intermittent faults, software anomalies, or concealed wiring. A separate fee may apply unless agreed in writing.

Customer agrees to provide safe, unobstructed access to all system components and disclose known hazards prior to the technician's arrival.

---

## 02. Diagnostic Service Fee

The Diagnostic Service Fee of **${{custom_field.diagnostic_fee}}** covers one (1) on-site visit including:

- Full system inspection
- Inverter string testing and monitoring review
- Production data analysis
- Findings report with recommended next steps

The fee is non-refundable once the visit is completed.

---

## 03. Service Fee Credit

The full diagnostic fee may be credited toward a qualifying work order when the following condition is met:

- Customer authorizes a qualifying upgrade through Solar Review Corp — including but not limited to panel upgrade, inverter replacement, battery storage, system expansion, or remove/reroof/reinstall (Powerwall, Enphase, Franklin WH, etc.)

Credit is valid for 12 months from the date of this agreement. Non-transferable and non-redeemable for cash.

---

## 04. Limitation of Liability

Solar Review Corp does not guarantee the diagnostic will identify all causes of failure. Findings represent professional judgment at the time of the visit and may change upon further investigation.

Solar Review Corp is not liable for pre-existing conditions, prior faulty workmanship, or manufacturer defects discovered during the diagnostic.

Solar Review Corp is not a party to, and assumes no responsibility for, any previously arranged financing agreements, solar loan agreements, power purchase agreements (PPAs), solar lease agreements, PACE obligations, or any other financial instruments entered into by the Customer with any prior solar company, lender, or financing provider. All obligations under such agreements remain solely the responsibility of the homeowner.

---

## 05. Governing Law

This agreement is governed by the laws of the State of California. Any disputes shall first be addressed through good-faith mediation. If unresolved, disputes shall be submitted to binding arbitration under the rules of the American Arbitration Association in San Diego County, California.

---

## Customer Authorization

By signing below, Customer confirms they have read, understood, and agreed to all terms of this Solar System Diagnostic Service Agreement, and authorizes Solar Review Corp to proceed with the scheduled diagnostic visit upon receipt of payment.

**Customer Signature:** _________________________ **Date:** _____________

**Printed Name:** _________________________

**Solar Review Corp Representative:** _________________________ **Date:** _____________

---

*Solar Review Corp | License #: 117450 | (619) 777-6527 | fixmy.energy | San Diego, CA*

---

---
# GHL SETUP INSTRUCTIONS
## How to Upload, Configure & Send (Combined Sign + Pay Flow)

---

## Step 1 — Create the Document in GHL

1. In GHL, go to **Payments → Documents & Contracts**
2. Open your existing Diagnostic Agreement document (or tap **+ New Document** if starting fresh)
3. Name it: `Solar System Diagnostic — Service Agreement`

---

## Step 2 — Build the Document

### Paste the agreement text:
Copy everything from "SOLAR SYSTEM DIAGNOSTIC — SERVICE AGREEMENT" down to the signature line above. Paste it into the GHL document editor, replacing the existing content.

### Add GHL merge fields (replaces the placeholders):
In the GHL editor, highlight each placeholder and replace using the **{ } Variables** button:

| Placeholder in text | GHL Variable to insert |
|---------------------|----------------------|
| `{{contact.full_name}}` | Contact → Full Name |
| `{{contact.phone}}` | Contact → Phone |
| `{{contact.address1}}` | Contact → Address Line 1 |
| `{{contact.email}}` | Contact → Email |
| `{{current_date}}` | System → Current Date |
| `{{invoice.number}}` | Invoice → Invoice Number |
| `{{custom_field.diagnostic_fee}}` | Custom Field → diagnostic_fee |

> **Note:** You'll need to create one custom contact field in GHL (if not already created):
> - `diagnostic_fee` (number)
> This gets populated automatically by the portal webhook when the diagnostic fee is set.

---

## Step 3 — Add Signature Fields

1. Scroll to the signature section at the bottom of the document
2. Click **+ Add Element → Signature** — assign to: **Contact (Signer 1)**
3. Click **+ Add Element → Date** — assign to: Signer 1
4. Click **+ Add Element → Text** — for Printed Name

---

## Step 4 — Add Payment (Combined Sign + Pay)

1. Below the signature block, click **+ Add Element → Payment**
2. Set:
   - **Amount:** `{{custom_field.diagnostic_fee}}` (or enter a fixed amount for testing)
   - **Description:** Solar System Diagnostic — Service Fee
   - **Payment type:** Full Payment
3. Customer signs first, then is immediately prompted to pay in the same browser session

---

## Step 5 — Configure Sending Settings

1. Click **Settings** (gear icon) in the document editor
2. Set:
   - **Expiration:** 7 days
   - **Redirect after signing:** Your thank-you page or leave default
   - **Email notification to:** dennis@fixmy.energy
3. Save the document

---

## Step 6 — Create the Sending Workflow

1. Go to **Automations → Workflows → + New Workflow**
2. Name: `Solar Review — Diagnostic Agreement`
3. **Trigger:** Inbound Webhook → set Mapping Reference to `email`
4. **Action 1:** Create/Update Contact
   - Email: `{{trigger.email}}`
   - Full Name: `{{trigger.full_name}}`
   - Phone: `{{trigger.phone}}`
   - Custom Field `diagnostic_fee`: `{{trigger.diagnostic_fee}}`
5. **Action 2:** Send Document
   - Select: `Solar System Diagnostic — Service Agreement`
   - Send via: **Email + SMS**
   - Signer: Contact (Signer 1)
6. **Action 3:** Internal Notification → Email to dennis@fixmy.energy
   - Subject: `Diagnostic Agreement Sent — {{contact.full_name}}`
   - Body: `Diagnostic agreement sent to {{contact.email}} for ${{trigger.diagnostic_fee}}`
7. **Publish** the workflow
8. **Copy the Inbound Webhook URL** — paste it here and I'll wire it into the portal

---

## Step 7 — Wire Into the Portal

Once you paste the webhook URL here, I'll:
1. Replace the empty `GHL_DIAG_AGREEMENT_WEBHOOK` constant in portal.html
2. Confirm the webhook payload includes `diagnostic_fee`
3. Remove the separate `GHL_DIAG_INVOICE_WEBHOOK` constant (no longer needed)

---

## Full Customer Experience (End to End)

1. **Admin moves lead to Step 3** → Diagnostic fee modal appears → Admin/Tech selects fee (e.g. $349)
2. **Portal saves fee** → fires webhook → GHL workflow triggers
3. **Customer receives** email + SMS: "Please sign your Solar System Diagnostic Service Agreement"
4. **Customer opens document** → reads terms → signs → **immediately prompted to pay** diagnostic fee in same window
5. **GHL notifies Dennis** that agreement is signed and payment collected
6. **Tech shows up** for the diagnostic visit

---

*This file is saved in the fixmy-energy repo for reference. Do not publish publicly.*
