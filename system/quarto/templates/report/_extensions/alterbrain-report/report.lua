-- Alterbrain report filter (Typst output only).
--   1. ::: {.box}  ... :::        becomes the summary box (optional title="...").
--   2. A paragraph written fully in italics becomes a small grey source note.
--   3. The reference list heading is printed by the template, so a "## References {-}" heading
--      and an empty ::: {#refs} block written by the author are removed (no double heading).
--   (Quarto already turns ## into the first section level when the document has a title.)

if not FORMAT:match("typst") then return {} end

local function raw(s) return pandoc.RawBlock("typst", s) end

local function typst_string(s)
  -- a Typst content block with the text escaped
  local bs = string.char(92)
  s = s:gsub(bs, bs .. bs)
  s = s:gsub("[%[%]#%$@<>%*_`~]", function(c) return bs .. c end)
  return "[" .. s .. "]"
end

local function box(div)
  if not div.classes:includes("box") then return nil end
  local title = div.attributes["title"]
  local open = "#summary-box("
  if title and title ~= "" then open = open .. "title: " .. typst_string(title) end
  open = open .. ")["
  local out = pandoc.List({ raw(open) })
  out:extend(div.content)
  out:insert(raw("]"))
  return out
end

local function source_note(para)
  if #para.content == 1 and para.content[1].t == "Emph" then
    local out = pandoc.List({ raw("#source-note[") })
    out:insert(pandoc.Plain(para.content[1].content))
    out:insert(raw("]"))
    return out
  end
  return nil
end

-- Remove an author-written ::: {#refs} block and the unnumbered heading just before it.
local function drop_refs_block(doc)
  local out = pandoc.List({})
  for _, blk in ipairs(doc.blocks) do
    if blk.t == "Div" and blk.identifier == "refs" then
      local prev = out[#out]
      if prev and prev.t == "Header" and prev.classes:includes("unnumbered") then
        out:remove(#out)
      end
    else
      out:insert(blk)
    end
  end
  doc.blocks = out
  return doc
end

return {
  { Pandoc = drop_refs_block },
  {
    Div = box,
    Para = source_note,
  },
}
