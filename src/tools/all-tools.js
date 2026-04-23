import { z } from "zod";
import { getClioClient } from "../clio/client.js";

export function registerAllTools(server) {
  const clio = getClioClient();

  server.tool("clio_search_matters", "Search Clio matters by name, number, client name, or keyword.",
    { query: z.string().optional().describe("Search term"), status: z.enum(["open","pending","closed"]).optional(), limit: z.number().optional().describe("Max results") },
    async ({ query, status, limit }) => {
      const p = { fields: "id,display_number,description,status,open_date,close_date,billable,client{id,name},practice_area{id,name},responsible_attorney{id,name}", limit: limit || 20, order: "id(desc)" };
      if (query) p.query = query;
      if (status) p.status = status;
      const d = await clio.get("/matters.json", p);
      return { content: [{ type: "text", text: JSON.stringify({ total: d.meta?.records, matters: d.data }, null, 2) }] };
    });

  server.tool("clio_get_matter", "Get full matter details by ID.",
    { matter_id: z.number().describe("Clio matter ID") },
    async ({ matter_id }) => {
      const d = await clio.get(`/matters/${matter_id}.json`, { fields: "id,display_number,description,status,open_date,close_date,billable,client{id,name,type},practice_area{id,name},responsible_attorney{id,name},originating_attorney{id,name},custom_field_values{id,field_name,value}" });
      return { content: [{ type: "text", text: JSON.stringify(d.data, null, 2) }] };
    });

  server.tool("clio_create_matter", "Create a new matter.",
    { description: z.string().describe("Matter name"), client_id: z.number().describe("Client ID"), status: z.enum(["open","pending"]).optional(), practice_area_id: z.number().optional(), responsible_attorney_id: z.number().optional(), billable: z.boolean().optional() },
    async ({ description, client_id, status, practice_area_id, responsible_attorney_id, billable }) => {
      const b = { data: { description, client: { id: client_id }, status: status || "open", billable: billable !== false } };
      if (practice_area_id) b.data.practice_area = { id: practice_area_id };
      if (responsible_attorney_id) b.data.responsible_attorney = { id: responsible_attorney_id };
      const d = await clio.post("/matters.json", b);
      return { content: [{ type: "text", text: JSON.stringify(d.data, null, 2) }] };
    });

  server.tool("clio_search_contacts", "Search contacts (clients, companies, counsel).",
    { query: z.string().optional().describe("Name, email, or phone"), type: z.enum(["Person","Company"]).optional(), limit: z.number().optional() },
    async ({ query, type, limit }) => {
      const p = { fields: "id,name,type,title,company{id,name},email_addresses{name,address,default_email},phone_numbers{name,number}", limit: limit || 20, order: "name(asc)" };
      if (query) p.query = query;
      if (type) p.type = type;
      const d = await clio.get("/contacts.json", p);
      return { content: [{ type: "text", text: JSON.stringify({ total: d.meta?.records, contacts: d.data }, null, 2) }] };
    });

  server.tool("clio_get_contact", "Get contact details by ID.",
    { contact_id: z.number().describe("Contact ID") },
    async ({ contact_id }) => {
      const d = await clio.get(`/contacts/${contact_id}.json`, { fields: "id,name,type,title,first_name,last_name,company{id,name},email_addresses{name,address},phone_numbers{name,number},addresses{name,street,city,province,postal_code}" });
      return { content: [{ type: "text", text: JSON.stringify(d.data, null, 2) }] };
    });

  server.tool("clio_create_contact", "Create a contact (Person or Company).",
    { first_name: z.string().optional(), last_name: z.string().optional(), name: z.string().optional().describe("Company name"), type: z.enum(["Person","Company"]).optional(), email: z.string().optional(), phone: z.string().optional(), title: z.string().optional(), company_id: z.number().optional() },
    async ({ first_name, last_name, name, type, email, phone, title, company_id }) => {
      const ct = name ? "Company" : type || "Person";
      const b = { data: { type: ct } };
      if (ct === "Company") { b.data.name = name; } else { b.data.first_name = first_name; b.data.last_name = last_name; if (title) b.data.title = title; if (company_id) b.data.company = { id: company_id }; }
      if (email) b.data.email_addresses = [{ name: "Work", address: email, default_email: true }];
      if (phone) b.data.phone_numbers = [{ name: "Work", number: phone }];
      const d = await clio.post("/contacts.json", b);
      return { content: [{ type: "text", text: JSON.stringify(d.data, null, 2) }] };
    });

  server.tool("clio_create_time_entry", "Log time (0.1h increments). Narrative: what/purpose/issue.",
    { matter_id: z.number(), quantity: z.number().describe("Hours in 0.1 increments"), date: z.string().describe("YYYY-MM-DD"), note: z.string().describe("Narrative"), user_id: z.number().optional() },
    async ({ matter_id, quantity, date, note, user_id }) => {
      const r = Math.round(quantity * 10) / 10;
      const b = { data: { type: "TimeEntry", quantity: r * 3600, date, note, matter: { id: matter_id } } };
      if (user_id) b.data.user = { id: user_id };
      const d = await clio.post("/activities.json", b);
      return { content: [{ type: "text", text: JSON.stringify({ created: true, id: d.data.id, matter_id, quantity: r, date, note }, null, 2) }] };
    });

  server.tool("clio_list_time_entries", "List time entries by matter, user, or date.",
    { matter_id: z.number().optional(), user_id: z.number().optional(), limit: z.number().optional() },
    async ({ matter_id, user_id, limit }) => {
      const p = { fields: "id,type,date,quantity,note,total,billed,matter{id,display_number},user{id,name}", limit: limit || 50, order: "date(desc)" };
      if (matter_id) p.matter_id = matter_id;
      if (user_id) p.user_id = user_id;
      const d = await clio.get("/activities.json", p);
      return { content: [{ type: "text", text: JSON.stringify({ total: d.meta?.records, entries: d.data }, null, 2) }] };
    });

  server.tool("clio_create_expense", "Log a disbursement/expense.",
    { matter_id: z.number(), amount: z.number(), date: z.string().describe("YYYY-MM-DD"), note: z.string() },
    async ({ matter_id, amount, date, note }) => {
      const d = await clio.post("/activities.json", { data: { type: "Expense", total: amount, date, note, matter: { id: matter_id } } });
      return { content: [{ type: "text", text: JSON.stringify({ created: true, id: d.data.id, type: "Expense", amount, matter_id, note }, null, 2) }] };
    });

  server.tool("clio_list_tasks", "List tasks by matter/assignee/status.",
    { matter_id: z.number().optional(), assignee_id: z.number().optional(), status: z.enum(["pending","in_progress","in_review","complete"]).optional(), limit: z.number().optional() },
    async ({ matter_id, assignee_id, status, limit }) => {
      const p = { fields: "id,name,description,status,priority,due_at,matter{id,display_number},assignee{id,name}", limit: limit || 50, order: "due_at(asc)" };
      if (matter_id) p.matter_id = matter_id;
      if (assignee_id) p.assignee_id = assignee_id;
      if (status) p.status = status;
      const d = await clio.get("/tasks.json", p);
      return { content: [{ type: "text", text: JSON.stringify({ total: d.meta?.records, tasks: d.data }, null, 2) }] };
    });

  // FIX #1: Added type: 'User' to assignee object
  server.tool("clio_create_task", "Create a task linked to a matter.",
    { name: z.string().describe("Task name"), matter_id: z.number(), description: z.string().optional(), due_at: z.string().optional().describe("YYYY-MM-DD"), priority: z.enum(["Low","Normal","High"]).optional(), assignee_id: z.number().optional().describe("User ID of the assignee") },
    async ({ name, matter_id, description, due_at, priority, assignee_id }) => {
      const b = { data: { name, description: description || "", status: "pending", priority: priority || "Normal", matter: { id: matter_id } } };
      if (due_at) b.data.due_at = due_at;
      if (assignee_id) b.data.assignee = { id: assignee_id, type: "User" };
      const d = await clio.post("/tasks.json", b);
      return { content: [{ type: "text", text: JSON.stringify(d.data, null, 2) }] };
    });

  server.tool("clio_complete_task", "Mark a task as complete.",
    { task_id: z.number() },
    async ({ task_id }) => {
      await clio.patch(`/tasks/${task_id}.json`, { data: { status: "complete" } });
      return { content: [{ type: "text", text: "Task " + task_id + " completed." }] };
    });

  // NEW TOOL: List available calendars to discover calendar IDs (FIX: Removed unsupported owner field)
  server.tool("clio_list_calendars", "List all available calendars (needed to get calendar_owner IDs for creating entries).",
    { limit: z.number().optional() },
    async ({ limit }) => {
      const p = { fields: "id,name,color,light_color", limit: limit || 50 };
      const d = await clio.get("/calendars.json", p);
      return { content: [{ type: "text", text: JSON.stringify({ total: d.meta?.records, calendars: d.data }, null, 2) }] };
    });

  // FIX #2: Added from/to date filters and calendar_owner_id to prevent 500 errors
  server.tool("clio_list_calendar", "List calendar entries. Use from/to dates to avoid errors.",
    { matter_id: z.number().optional(), calendar_owner_id: z.number().optional().describe("Calendar ID from clio_list_calendars"), from: z.string().optional().describe("Start date YYYY-MM-DD"), to: z.string().optional().describe("End date YYYY-MM-DD"), limit: z.number().optional() },
    async ({ matter_id, calendar_owner_id, from, to, limit }) => {
      const p = { fields: "id,summary,description,start_at,end_at,all_day,location,matter{id,display_number},calendar_owner{id,name}", limit: limit || 50, order: "start_at(asc)" };
      if (matter_id) p.matter_id = matter_id;
      if (calendar_owner_id) p.calendar_owner_id = calendar_owner_id;
      if (from) p.from = from;
      if (to) p.to = to;
      const d = await clio.get("/calendar_entries.json", p);
      return { content: [{ type: "text", text: JSON.stringify({ total: d.meta?.records, entries: d.data }, null, 2) }] };
    });

  // FIX #3: Added calendar_owner_id parameter
  server.tool("clio_create_calendar_entry", "Create calendar entry (deadlines, hearings, reminders). Requires calendar_owner_id from clio_list_calendars.",
    { summary: z.string(), calendar_owner_id: z.number().describe("Calendar ID from clio_list_calendars (REQUIRED)"), description: z.string().optional(), start_at: z.string().describe("YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS-07:00"), end_at: z.string().optional(), all_day: z.boolean().optional(), matter_id: z.number().optional(), location: z.string().optional(), reminder_minutes: z.number().optional().describe("1440=1day") },
    async ({ summary, calendar_owner_id, description, start_at, end_at, all_day, matter_id, location, reminder_minutes }) => {
      const b = { data: { summary, description: description || "", start_at, end_at: end_at || start_at, all_day: all_day || false, calendar_owner: { id: calendar_owner_id } } };
      if (matter_id) b.data.matter = { id: matter_id };
      if (location) b.data.location = location;
      if (reminder_minutes) b.data.reminders = [{ minutes_before: reminder_minutes }];
      const d = await clio.post("/calendar_entries.json", b);
      return { content: [{ type: "text", text: JSON.stringify(d.data, null, 2) }] };
    });

  server.tool("clio_search_documents", "Search documents by matter or keyword.",
    { matter_id: z.number().optional(), query: z.string().optional(), limit: z.number().optional() },
    async ({ matter_id, query, limit }) => {
      const p = { fields: "id,name,content_type,created_at,updated_at,matter{id,display_number},creator{id,name}", limit: limit || 30, order: "updated_at(desc)" };
      if (matter_id) p.matter_id = matter_id;
      if (query) p.query = query;
      const d = await clio.get("/documents.json", p);
      return { content: [{ type: "text", text: JSON.stringify({ total: d.meta?.records, documents: d.data }, null, 2) }] };
    });

  server.tool("clio_list_bills", "List bills by matter, client, or status.",
    { matter_id: z.number().optional(), client_id: z.number().optional(), status: z.string().optional(), limit: z.number().optional() },
    async ({ matter_id, client_id, status, limit }) => {
      const p = { fields: "id,number,subject,status,issued_at,due_at,total,amount_due,paid,matter{id,display_number},client{id,name}", limit: limit || 20, order: "issued_at(desc)" };
      if (matter_id) p.matter_id = matter_id;
      if (client_id) p.client_id = client_id;
      if (status) p.status = status;
      const d = await clio.get("/bills.json", p);
      return { content: [{ type: "text", text: JSON.stringify({ total: d.meta?.records, bills: d.data }, null, 2) }] };
    });

  server.tool("clio_get_bill", "Get bill details with line items.",
    { bill_id: z.number() },
    async ({ bill_id }) => {
      const d = await clio.get(`/bills/${bill_id}.json`, { fields: "id,number,subject,status,issued_at,due_at,total,amount_due,paid,client{id,name},matter{id,display_number},line_items{id,description,quantity,rate,total,type}" });
      return { content: [{ type: "text", text: JSON.stringify(d.data, null, 2) }] };
    });

  server.tool("clio_who_am_i", "Current Clio user info.", {},
    async () => {
      const d = await clio.get("/users/who_am_i.json", { fields: "id,name,email,enabled" });
      return { content: [{ type: "text", text: JSON.stringify(d.data, null, 2) }] };
    });

  server.tool("clio_list_users", "List all firm users.",
    { limit: z.number().optional() },
    async ({ limit }) => {
      const d = await clio.get("/users.json", { fields: "id,name,email,enabled,role", limit: limit || 50 });
      return { content: [{ type: "text", text: JSON.stringify({ total: d.meta?.records, users: d.data }, null, 2) }] };
    });
}
