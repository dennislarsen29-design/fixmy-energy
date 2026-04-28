# Solar Inverter Replacement Agreement
## GHL Upload Reference — Solar Review Corp (DBA: FIXMy.Energy)

---

# SOLAR INVERTER REPLACEMENT AGREEMENT

**Solar Review Corp** (DBA: FIXMy.Energy)
License #: 117450
(619) 777-6527 | fixmy.energy

---

**Customer Name:** {{contact.full_name}}
**Service Address:** {{contact.address1}}
**Date:** {{current_date}}
**Agreement #:** {{invoice.number}}

---

## 1. Scope of Work

Solar Review Corp agrees to perform the following services at the above-referenced property:

- Remove and dispose of the existing failed SunPower string inverter
- Supply and install one (1) Tesla Solar Inverter
- Reconnect the existing solar panel array to the new inverter
- Commission and test the system to confirm full solar production is restored
- Register the system to the Tesla app for customer monitoring access

All work will be performed by qualified technicians in compliance with applicable local codes and manufacturer specifications.

---

## 2. Pricing & Payment Schedule

**Total Contract Price:** ${{custom_field.diagnostic_fee}}

| Milestone | Amount | Due |
|-----------|--------|-----|
| Deposit | $1,000.00 | Due upon signing this agreement |
| Remaining Balance | ${{custom_field.remaining_balance}} | Due upon installation completion |

Payment is accepted via credit card, debit card, ACH bank transfer, or check made payable to Solar Review Corp.

---

## 3. Estimated Timeline

Work will be scheduled within **5–15 business days** of deposit receipt, subject to permitting timelines and parts availability. Customer will be notified of the confirmed installation date no later than 3 business days in advance.

---

## 4. Warranty

- **Labor Warranty:** 1 year on all installation workmanship performed by Solar Review Corp
- **Equipment Warranty:** Tesla inverter manufacturer warranty applies (10 years — see Tesla warranty documentation)

Solar Review Corp's labor warranty is void if the system is modified, repaired, or tampered with by any party other than Solar Review Corp without prior written consent.

---

## 5. Liability Disclaimer — Pre-Existing Equipment & Conditions

Customer acknowledges and agrees to the following:

**5.1 Pre-Existing Solar Panels**
Solar Review Corp is not responsible for the condition, age, performance, degradation, or failure of any solar panels previously installed at this property by any prior contractor or manufacturer. The replacement of the inverter does not constitute an inspection, warranty, or guarantee of the existing solar panels.

**5.2 Roof Penetrations & Structural Modifications**
Solar Review Corp assumes no liability for any roof penetrations, flashing, sealants, mounting hardware, or structural modifications made by any prior solar installer. Solar Review Corp is not responsible for any roof damage, leaks, or structural issues that are pre-existing or that arise from conditions created by a prior installation.

**5.3 Pre-Existing Equipment**
Solar Review Corp assumes no liability for any pre-existing equipment including but not limited to solar optimizers, microinverters, monitoring devices, combiner boxes, conduit, wiring, junction boxes, or any other components not installed by Solar Review Corp in the current scope of work.

**5.4 System Performance**
Post-installation system production levels depend on the condition of the existing solar panels, shading, orientation, and other factors outside Solar Review Corp's control. Solar Review Corp does not guarantee that production levels will match original installation specifications.

**5.5 Prior Financing, Loan & Solar Agreement Terms**
Solar Review Corp is not a party to, and assumes no responsibility for, any previously arranged financing agreements, solar loan agreements, power purchase agreements (PPAs), solar lease agreements, PACE obligations, or any other financial instruments entered into by the Customer with any prior solar company, lender, or financing provider. All obligations under such agreements remain solely the responsibility of the homeowner. Additionally, any prior repairs, battery retrofits, system upgrades, or other work previously performed by Solar Review Corp under separate agreements remains the sole responsibility of the homeowner and is not covered under the warranty or scope of work described in this agreement unless explicitly stated herein.

---

## 6. Customer Responsibilities

Customer agrees to:
- Ensure safe and clear access to the inverter location, electrical panel, and roof (if required) on the scheduled installation date
- Ensure a responsible adult (18+) is present at the property during installation
- Notify Solar Review Corp of any known structural, electrical, or roof concerns prior to installation

Failure to provide access on the scheduled date may result in a rescheduling fee of $150.

---

## 7. Cancellation Policy

- Cancellations made **more than 72 hours** before the scheduled installation date: full deposit refund
- Cancellations made **within 72 hours** of the scheduled installation date: deposit is non-refundable
- If Solar Review Corp cancels or reschedules due to parts delay or scheduling conflict: full deposit refund or reschedule at customer's election

---

## 8. Dispute Resolution

Any disputes arising from this agreement shall first be addressed through good-faith negotiation. If unresolved, disputes shall be submitted to binding arbitration under the rules of the American Arbitration Association in San Diego County, California. This agreement shall be governed by the laws of the State of California.

---

## 9. Entire Agreement

This document constitutes the entire agreement between Solar Review Corp and the Customer for the scope of work described herein. No verbal representations, warranties, or promises made by any Solar Review Corp representative shall be binding unless included in this written agreement. This agreement supersedes all prior discussions or understandings.

---

## Acceptance & Electronic Signature

By signing below, Customer confirms they have read, understood, and agree to all terms of this Solar Inverter Replacement Agreement, and authorizes Solar Review Corp to proceed with the described scope of work upon receipt of the deposit payment.

**Customer Signature:** _________________________ **Date:** _____________

**Printed Name:** _________________________

**Solar Review Corp Representative:** _________________________ **Date:** _____________

---

*Solar Review Corp | (619) 777-6527 | fixmy.energy | San Diego, CA*

---

---
# GHL SETUP INSTRUCTIONS
## How to Upload, Configure & Send (Combined Sign + Pay Flow)

---

## Step 1 — Create the Document in GHL

1. In GHL, go to **Payments → Documents & Contracts**
2. Tap **+ New Document**
3. Name it: `Solar Inverter Replacement Agreement`
4. Choose **Blank Document** (not a template)

---

## Step 2 — Build the Document

### Paste the agreement text:
Copy everything from "SOLAR INVERTER REPLACEMENT AGREEMENT" down to the signature line above. Paste it into the GHL document editor.

### Add GHL merge fields (replaces the placeholders):
In the GHL editor, highlight each placeholder and replace using the **{ } Variables** button:

| Placeholder in text | GHL Variable to insert |
|---------------------|----------------------|
| `{{contact.full_name}}` | Contact → Full Name |
| `{{contact.address1}}` | Contact → Address Line 1 |
| `{{current_date}}` | System → Current Date |
| `{{invoice.number}}` | Invoice → Invoice Number |
| `{{custom_field.diagnostic_fee}}` | Custom Field → diagnostic_fee |
| `{{custom_field.remaining_balance}}` | Custom Field → remaining_balance |

> **Note:** You'll need to create two custom contact fields in GHL:
> - `diagnostic_fee` (number)
> - `remaining_balance` (number)
> These get populated automatically by the portal webhook when the proposal is accepted.

---

## Step 3 — Add Signature Fields

1. In the document editor, scroll to the signature section at the bottom
2. Click **+ Add Element → Signature**
3. Assign it to: **Contact (Signer 1)**
4. Add a second field: **+ Add Element → Date** — also assigned to Signer 1
5. Add **+ Add Element → Text** for Printed Name

---

## Step 4 — Add Payment (The Key Step — Combines Sign + Pay)

1. Below the signature block, click **+ Add Element → Payment**
2. Set:
   - **Amount:** `{{custom_field.diagnostic_fee}}` (or enter $4,587.50 as fixed for now)
   - **Description:** Solar Inverter Replacement — Deposit
   - **Payment type:** Select **Deposit** or **Full Payment** depending on your flow
3. This payment element appears AFTER the customer signs — they sign first, then pay immediately in the same browser session

> **Best practice:** Set the payment to collect only the **$1,000 deposit** here. Send a separate invoice for the remaining balance upon completion (you already have the GHL invoice workflow set up).

---

## Step 5 — Configure Sending Settings

1. Click **Settings** (gear icon) in the document editor
2. Set:
   - **Expiration:** 7 days
   - **Redirect after signing:** Your thank-you page or leave default
   - **Email notification to:** your email (dennis@fixmy.energy)
3. Save the document

---

## Step 6 — Create the Sending Workflow

1. Go to **Automations → Workflows → + New Workflow**
2. Name: `Solar Review — Inverter Swap Agreement`
3. **Trigger:** Inbound Webhook (same setup as before — set Mapping Reference to `email`)
4. **Action 1:** Create/Update Contact
   - Email: `{{trigger.email}}`
   - Full Name: `{{trigger.full_name}}`
   - Phone: `{{trigger.phone}}`
   - Custom Field `diagnostic_fee`: `{{trigger.diagnostic_fee}}`
   - Custom Field `remaining_balance`: `{{trigger.remaining_balance}}`
5. **Action 2:** Send Document
   - Select: `Solar Inverter Replacement Agreement`
   - Send via: **Email + SMS**
   - Signer: Contact (Signer 1)
6. **Action 3:** Internal Notification → Email to dennis@fixmy.energy
   - Subject: `Agreement Sent — {{contact.full_name}}`
   - Body: `Inverter swap agreement sent to {{contact.email}} for ${{trigger.diagnostic_fee}}`
7. **Publish** the workflow
8. **Copy the Inbound Webhook URL** — paste it here and I'll wire it into the portal

---

## Step 7 — Wire Into the Portal

Once you paste the webhook URL here, I'll:
1. Replace the empty `GHL_DIAG_AGREEMENT_WEBHOOK` constant in portal.html
2. Update the webhook payload to include `diagnostic_fee` and `remaining_balance`
3. Remove the separate `GHL_DIAG_INVOICE_WEBHOOK` since the deposit is now collected at signing

---

## Full Customer Experience (End to End)

1. **Admin moves lead to Step 3** → Diagnostic fee modal appears → Admin selects fee (e.g. $4,587.50)
2. **Portal saves fee** → fires webhook → GHL workflow triggers
3. **Customer receives** email + SMS: "Please sign your Solar Inverter Replacement Agreement"
4. **Customer opens document** → reads terms → signs → **immediately prompted to pay $1,000 deposit** in same window
5. **GHL notifies Dennis** that agreement is signed + deposit paid
6. **Admin updates portal** invoice status to "Paid" for the deposit
7. **Install is completed** → admin sends remaining balance invoice ($3,587.50) via GHL Payments or portal invoice

---

*This file is saved in the fixmy-energy repo for reference. Do not publish publicly.*
