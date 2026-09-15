// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { serializeValue } from '../src/core/serialize-value';

describe('serializeValue with DOM nodes', () => {
  it('summarises an element instead of walking it', () => {
    const element = document.createElement('button');
    element.id = 'save';
    element.className = 'primary';
    element.textContent = '  Save changes  ';

    expect(serializeValue(element)).toEqual({
      t: 'dom',
      tag: 'button',
      id: 'save',
      className: 'primary',
      text: 'Save changes',
    });
  });

  it('describes text nodes and documents by node name', () => {
    expect(serializeValue(document.createTextNode('hi'))).toEqual({ t: 'dom', tag: '#text', text: 'hi' });
    expect(serializeValue(document)).toMatchObject({ t: 'dom', tag: '#document' });
  });
});
