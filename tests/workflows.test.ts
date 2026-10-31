import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const testDir=fs.mkdtempSync(path.join(os.tmpdir(),'brightloop-workflows-'));
const dbPath=path.join(testDir,'workflow.db');
const port=Number(process.env.BRIGHTLOOP_WORKFLOW_PORT||3147);
const origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.resolve('node_modules/tsx/dist/cli.mjs'),'server.ts'],{cwd:process.cwd(),stdio:'inherit',env:{...process.env,BRIGHTLOOP_DB_PATH:dbPath,PORT:String(port),NODE_ENV:'development'}});

type Result={status:number;data:any};
async function request(url:string,options:RequestInit={},token?:string):Promise<Result>{
  const headers=new Headers(options.headers||{});if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');if(token)headers.set('Authorization',`Bearer ${token}`);
  const response=await fetch(`${origin}${url}`,{...options,headers});let data:any={};try{data=await response.json();}catch{/* no body */}return {status:response.status,data};
}
async function json(url:string,body:any,token?:string,method='POST'){return request(url,{method,body:JSON.stringify(body)},token);}
async function untilReady(){for(let i=0;i<60;i++){if(server.exitCode!==null)throw new Error('Brightloop server exited before becoming ready.');try{const r=await fetch(`${origin}/api/public/catalog`);if(r.ok)return;}catch{/* wait for server */}await new Promise(r=>setTimeout(r,300));}throw new Error('Brightloop test server did not start in time.');}
function ok(result:Result,message:string){assert.ok(result.status>=200&&result.status<300,`${message}: HTTP ${result.status} ${JSON.stringify(result.data)}`);return result.data;}

async function run(){
  await untilReady();
  const admin=ok(await json('/api/auth/login',{email:'admin@brightloop.gg',password:'BrightloopAdmin!2026'}), 'Admin login');
  const adminToken=admin.token as string;
  const catalogBefore=ok(await request('/api/public/catalog'),'Public catalog');

  // A. Registration -> login -> plan checkout -> activation, with no auto-created subscription.
  const registration=ok(await json('/api/auth/register',{name:'Workflow Player',email:'workflow.player@example.test',password:'FlowPass!2026'}),'Customer registration');
  let dash=ok(await request('/api/gamer/dashboard',{},registration.token),'New customer dashboard');
  assert.equal(dash.subscription,null,'A new customer should select a plan before a subscription exists.');
  const customer=ok(await json('/api/auth/login',{email:'workflow.player@example.test',password:'FlowPass!2026'}),'Customer login');
  const afterLogin=ok(await request('/api/gamer/dashboard',{},customer.token),'Dashboard after login');
  assert.equal(afterLogin.subscription,null);

  // D. Product and plan writes appear in the public catalog used by the plan/checkout pages.
  const product=ok(await json('/api/admin/products',{name:'Workflow Expansion Pack',description:'A test add-on for the integration workflow.',category:'Expansion Pack',basePrice:500,costPrice:150,isActive:true,variants:[]},adminToken),'Create product');
  const plan=ok(await json('/api/admin/plans',{name:'Workflow Pro Plan',tagline:'A complete plan used for end-to-end verification.',billingPeriod:'MONTHLY',price:2400,costPrice:700,perks:['Shared catalog access','Pause eligible membership'],allowPause:true,maxPauseDays:30,autoClose:false,isRecommended:false},adminToken),'Create plan');
  const catalog=ok(await request('/api/public/catalog'),'Refresh public catalog');
  assert.ok(catalog.plans.some((p:any)=>p.id===plan.id),'Admin plan is listed in the customer catalog.');
  assert.ok(catalog.products.some((p:any)=>p.id===product.id),'Admin product is listed as a checkout add-on.');

  const activated=ok(await json('/api/gamer/subscribe',{planId:plan.id,paymentMethod:'CREDIT_CARD'},customer.token),'Checkout and activate customer plan');
  assert.equal(activated.paymentMode,'SIMULATED_DEMO');
  assert.match(activated.invoiceNumber,/^BL-\d{4}-\d+$/);
  dash=ok(await request('/api/gamer/dashboard',{},customer.token),'Customer dashboard after checkout');
  assert.equal(dash.subscription.id,activated.subId);
  assert.equal(dash.subscription.status,'ACTIVE');
  assert.equal(dash.invoices[0].status,'PAID');
  assert.equal(dash.payments[0].status,'SUCCESS');
  const adminSubs=ok(await request('/api/admin/subscriptions',{},adminToken),'Admin subscriptions');
  assert.ok(adminSubs.subscriptions.some((s:any)=>s.id===activated.subId),'Customer activation appears in admin subscriptions.');

  // B. Pause updates expiry immediately; resume restores access without double-extending it.
  const oldEnd=new Date(dash.subscription.currentPeriodEnd).getTime();
  ok(await json(`/api/subscriptions/${activated.subId}/pause`,{durationDays:14,reason:'Workflow pause test'},customer.token),'Pause membership');
  let paused=ok(await request('/api/gamer/dashboard',{},customer.token),'Read paused membership');
  assert.equal(paused.subscription.status,'PAUSED');
  const extendedEnd=new Date(paused.subscription.currentPeriodEnd).getTime();
  assert.equal(Math.round((extendedEnd-oldEnd)/86400000),14,'Pause immediately extends the stored subscription end date.');
  ok(await json(`/api/subscriptions/${activated.subId}/resume`,{},customer.token),'Resume membership');
  const resumed=ok(await request('/api/gamer/dashboard',{},customer.token),'Read resumed membership');
  assert.equal(resumed.subscription.status,'ACTIVE');
  assert.equal(new Date(resumed.subscription.currentPeriodEnd).getTime(),extendedEnd,'Resume does not apply the planned extension twice.');

  // C. Loyalty redemption is per-customer and persisted in the shared database.
  const beforePoints=ok(await request('/api/gamer/loyalty',{},customer.token),'Read loyalty balance');
  assert.equal(beforePoints.available,1000,'New customers receive the recorded welcome points.');
  ok(await json('/api/gamer/loyalty/redeem',{rewardId:'sub-5'},customer.token),'Redeem loyalty reward');
  const afterPoints=ok(await request('/api/gamer/loyalty',{},customer.token),'Read redeemed balance');
  assert.equal(afterPoints.available,500);
  assert.equal(afterPoints.transactions[0].points,-500);

  // E. Discount eligibility, add-on line items and invoice totals stay linked.
  const coupon=ok(await json('/api/admin/discounts',{code:'FLOW10',description:'Workflow test discount',type:'PERCENT',value:10,minQuantity:2,maxUses:4,minPurchaseCents:1000,productIds:[product.id],planIds:[plan.id],customerEligibility:'ALL',startDate:new Date(Date.now()-3600000).toISOString(),endDate:new Date(Date.now()+7*86400000).toISOString(),isActive:true},adminToken),'Create discount');
  assert.ok(coupon.id);
  const second=ok(await json('/api/auth/register',{name:'Discount Player',email:'workflow.discount@example.test',password:'FlowPass!2026'}),'Register discount customer');
  const applied=ok(await json('/api/gamer/subscribe',{planId:plan.id,discountCode:'FLOW10',paymentMethod:'CREDIT_CARD',products:[{productId:product.id,quantity:1}]},second.token),'Checkout with discount and product');
  assert.equal(applied.subtotal,2900);
  assert.equal(applied.discountAmount,290);
  assert.equal(applied.taxAmount,470);
  assert.equal(applied.totalAmount,3080);
  const secondDash=ok(await request('/api/gamer/dashboard',{},second.token),'Read discounted invoice');
  assert.equal(secondDash.invoices[0].discountCode,'FLOW10');
  const lineItems=ok(await request('/api/admin/billing',{},adminToken),'Read billing records').invoices.find((i:any)=>i.id===secondDash.invoices[0].id).lineItems;
  assert.equal(lineItems.length,2,'Invoice contains a plan and its purchased add-on.');
  const usage=ok(await request('/api/admin/overview',{},adminToken),'Read discount analytics').discounts.find((d:any)=>d.id===coupon.id);
  assert.equal(usage.usedCount,1);

  // F. Successful payment changes invoice status and becomes the financial source record.
  const createdForPay=ok(await json('/api/billing/generate-invoices',{subscriptionId:activated.subId,billingPeriodKey:`flow-f-${Date.now()}`},adminToken),'Generate payment test invoice');
  const invoiceToPay=createdForPay.invoices[0];assert.ok(invoiceToPay);
  ok(await json(`/api/gamer/invoices/${invoiceToPay.id}/pay`,{method:'CREDIT_CARD'},customer.token),'Pay invoice');
  const paidDash=ok(await request('/api/gamer/dashboard',{},customer.token),'Read paid invoice');
  assert.equal(paidDash.invoices.find((i:any)=>i.id===invoiceToPay.id).status,'PAID');
  assert.ok(paidDash.payments.some((p:any)=>p.invoiceId===invoiceToPay.id&&p.status==='SUCCESS'));
  const finance=ok(await request('/api/admin/overview',{},adminToken),'Refresh financial overview');
  assert.ok(finance.kpis.totalRevenueCents>0,'Dashboard revenue comes from successful shared Payment records.');
  const failedInvoiceSet=ok(await json('/api/billing/generate-invoices',{subscriptionId:activated.subId,billingPeriodKey:`flow-h-${Date.now()}`},adminToken),'Generate failed payment invoice');
  const failedInvoice=failedInvoiceSet.invoices[0];assert.ok(failedInvoice);

  // G. Inactivity creates a customer-facing pause notification from actual account activity.
  const rawDb=new Database(dbPath);
  rawDb.prepare('UPDATE User SET lastLoginAt=? WHERE id=?').run(new Date(Date.now()-45*86400000).toISOString(),customer.user.id);
  rawDb.close();
  const inactiveDash=ok(await request('/api/gamer/dashboard',{},customer.token),'Generate inactivity notification');
  assert.ok(inactiveDash.notifications.some((n:any)=>n.kind==='PAUSE_OFFER'));
  ok(await json(`/api/subscriptions/${activated.subId}/pause`,{durationDays:7,reason:'Pause notification test'},customer.token),'Accept pause offer');

  // H. Failed payment remains outstanding and is visible in security investigation data.
  const failedPayment=await json(`/api/gamer/invoices/${failedInvoice.id}/pay`,{method:'CREDIT_CARD',simulateOutcome:'FAILED'},customer.token);
  assert.equal(failedPayment.status,402);
  const security=ok(await request('/api/security/dashboard',{},adminToken),'Review security alerts');
  assert.ok(security.logs.some((log:any)=>log.eventType==='PAYMENT_FAILURE'&&log.detailsParsed.invoiceId===failedInvoice.id));
  const unpaid=ok(await request('/api/gamer/dashboard',{},customer.token),'Verify failed invoice stays unpaid');
  assert.notEqual(unpaid.invoices.find((i:any)=>i.id===failedInvoice.id).status,'PAID');

  // I. Collection follow-up and recovered payment update the same overdue invoice.
  const overdue=ok(await request('/api/admin/billing',{},adminToken),'Load overdue invoices').invoices.find((i:any)=>i.id==='inv_liam_oct_1');
  assert.ok(overdue,'Seeded overdue collection record is present.');
  ok(await json('/api/intelligence/collection-follow-up',{invoiceId:overdue.id,notes:'Integration follow-up',scheduledAt:new Date(Date.now()+86400000).toISOString()},adminToken),'Record collection follow-up');
  const priorities=ok(await request(`/api/intelligence/business-report?start=${new Date(Date.now()-30*86400000).toISOString().slice(0,10)}&end=${new Date().toISOString().slice(0,10)}`,{},adminToken),'Read collection priorities');
  assert.ok(priorities.collectionPriorities.some((row:any)=>row.invoices.some((i:any)=>i.id===overdue.id)));
  ok(await json('/api/intelligence/collection-recovered',{invoiceId:overdue.id,method:'MANUAL',referenceCode:'WORKFLOW-RECOVERY'},adminToken),'Record recovered payment');
  const billingAfterRecovery=ok(await request('/api/admin/billing',{},adminToken),'Confirm recovered invoice');
  assert.equal(billingAfterRecovery.invoices.find((i:any)=>i.id===overdue.id).status,'PAID');
  assert.ok(billingAfterRecovery.payments.some((p:any)=>p.invoiceId===overdue.id&&p.status==='SUCCESS'));

  // J. Forecast and business reports reflect the ledger, and label projections as simulated.
  const forecast=ok(await request('/api/intelligence/revenue-forecast',{},adminToken),'Build revenue forecast');
  assert.equal(forecast.modelConnected,false);
  assert.equal(forecast.predictionMode,'RULE_BASED_SIMULATED');
  assert.ok(forecast.historicalRevenue.some((row:any)=>row.actualCents>0));
  const business=ok(await request(`/api/intelligence/business-report?start=${new Date(Date.now()-365*86400000).toISOString().slice(0,10)}&end=${new Date().toISOString().slice(0,10)}`,{},adminToken),'Build business report');
  assert.ok(business.revenue.actualRevenueCents>0);
  const answer=ok(await json('/api/intelligence/business-report/query',{question:'How much revenue did we generate this month?',start:new Date().toISOString().slice(0,8)+'01',end:new Date().toISOString().slice(0,10)},adminToken),'Ask report assistant');
  assert.match(answer.availabilityNote,/Payment records/);

  // O. Role permissions gate staff API access and account deactivation revokes login.
  const staff=ok(await json('/api/admin/staff',{name:'Workflow Billing Staff',email:'workflow.staff@example.test',password:'StaffPass!2026',staffRole:'Support',permissions:['customers.read']},adminToken),'Create least-privilege staff member');
  const staffLogin=ok(await json('/api/auth/login',{email:'workflow.staff@example.test',password:'StaffPass!2026'}),'Staff login');
  assert.equal((await request('/api/admin/customers',{},staffLogin.token)).status,200,'Granted staff permission is accepted.');
  assert.equal((await request('/api/admin/billing',{},staffLogin.token)).status,403,'Unassigned staff permission is denied.');
  ok(await json(`/api/admin/staff/${staff.staff.id}`,{isActive:false},adminToken,'PUT'),'Deactivate staff account');
  assert.equal((await request('/api/admin/customers',{},staffLogin.token)).status,401,'Existing staff session is invalidated on deactivation.');
  assert.equal((await json('/api/auth/login',{email:'workflow.staff@example.test',password:'StaffPass!2026'})).status,403,'Deactivated staff cannot log in.');

  // Duplicate same-period checkout cannot create another invoice or payment.
  const duplicate=await json('/api/gamer/subscribe',{planId:plan.id,paymentMethod:'CREDIT_CARD'},customer.token);
  assert.equal(duplicate.status,400);
  const invoiceNumbers=ok(await request('/api/admin/billing',{},adminToken),'Check unique invoice numbers').invoices.map((i:any)=>i.invoiceNumber);
  assert.equal(new Set(invoiceNumbers).size,invoiceNumbers.length,'Invoice numbers are unique across the shared billing table.');

  console.log('All Brightloop workflow scenarios A–J and staff access checks passed.');
}

run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{server.kill('SIGTERM');setTimeout(()=>{try{fs.rmSync(testDir,{recursive:true,force:true});}catch{/* clean isolated test database */}},300);});
