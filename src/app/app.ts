import { Component } from '@angular/core';
import { AddAttributeComponent } from './add-attribute/add-attribute';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AddAttributeComponent],
  template: '<app-add-attribute />',
})
export class App {}
