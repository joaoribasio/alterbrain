-- Alterbrain ATS-plain CV shortcode. {{< cv work >}} reads the list `cv.work` from the
-- document metadata (normally cv-data.yml) and prints plain paragraphs and bullet lists.
-- Entry fields: title, description (organisation), location, date, details (list).

local function plain(v)
  if v == nil then return nil end
  local s = pandoc.utils.stringify(v)
  if s == "" then return nil end
  return s
end

function cv(args, kwargs, meta)
  local key = pandoc.utils.stringify(args[1] or "")
  if key == "" then error("cv shortcode needs a section name, for example {{< cv work >}}") end
  local data = meta.cv and meta.cv[key]
  if data == nil then
    io.stderr:write("[alterbrain] cv section '" .. key .. "' is empty or missing in cv-data.yml\n")
    return pandoc.Null()
  end

  if pandoc.utils.type(data) ~= "List" then
    return pandoc.Para({ pandoc.Str(pandoc.utils.stringify(data)) })
  end

  local blocks = {}
  for _, item in ipairs(data) do
    local line = {}
    local title = plain(item.title)
    if title then table.insert(line, pandoc.Strong({ pandoc.Str(title) })) end
    for _, name in ipairs({ "description", "location", "date" }) do
      local s = plain(item[name])
      if s then
        if #line > 0 then table.insert(line, pandoc.Str(" | ")) end
        table.insert(line, pandoc.Str(s))
      end
    end
    if #line > 0 then table.insert(blocks, pandoc.Para(line)) end

    if item.details and pandoc.utils.type(item.details) == "List" and #item.details > 0 then
      local items = {}
      for _, d in ipairs(item.details) do
        table.insert(items, { pandoc.Plain({ pandoc.Str(pandoc.utils.stringify(d)) }) })
      end
      table.insert(blocks, pandoc.BulletList(items))
    end
  end
  return blocks
end
