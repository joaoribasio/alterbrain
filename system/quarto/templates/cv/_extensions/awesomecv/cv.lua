-- Alterbrain addition (not part of the upstream extension).
-- Shortcode {{< cv work >}} reads the list `cv.work` from the document's metadata
-- (normally cv-data.yml) and prints it as awesomecv entries.
-- Each entry may have: title, description, location, date, details (a list).
-- Text is treated as plain text: Typst's special characters are escaped here.

local function plain(v)
  if v == nil then return nil end
  local s = pandoc.utils.stringify(v)
  if s == "" then return nil end
  return s
end

local function esc(s)
  -- Escape every character Typst could read as markup, so "R&D $5m #1 C++" prints as typed.
  local bs = string.char(92) -- one backslash
  s = s:gsub(bs, bs .. bs)
  s = s:gsub("[%[%]#%$@<>%*_`~=%-+/]", function(c) return bs .. c end)
  return s
end

local function field(name, v)
  local s = plain(v)
  if s then return "  " .. name .. ": [" .. esc(s) .. "]," end
  return "  " .. name .. ": none,"
end

function cv(args, kwargs, meta)
  local key = pandoc.utils.stringify(args[1] or "")
  if key == "" then error("cv shortcode needs a section name, for example {{< cv work >}}") end
  local data = meta.cv and meta.cv[key]
  if data == nil then
    io.stderr:write("[alterbrain] cv section '" .. key .. "' is empty or missing in cv-data.yml\n")
    return pandoc.Null()
  end

  local out = {}
  if pandoc.utils.type(data) ~= "List" then
    -- A plain paragraph, for example the summary.
    table.insert(out, esc(pandoc.utils.stringify(data)))
    return pandoc.RawBlock("typst", table.concat(out, "\n"))
  end

  for _, item in ipairs(data) do
    table.insert(out, "#resume-entry(")
    table.insert(out, field("title", item.title))
    table.insert(out, field("location", item.location))
    table.insert(out, field("date", item.date))
    table.insert(out, field("description", item.description))
    table.insert(out, ")")
    if item.details and pandoc.utils.type(item.details) == "List" and #item.details > 0 then
      table.insert(out, "#resume-item[")
      for _, d in ipairs(item.details) do
        table.insert(out, "  - " .. esc(pandoc.utils.stringify(d)))
      end
      table.insert(out, "]")
    end
    table.insert(out, "")
  end
  return pandoc.RawBlock("typst", table.concat(out, "\n"))
end
